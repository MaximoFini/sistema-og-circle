import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-50 — cierre del Bloque 7: el circuito completo de revalidateTag, con
// browser real de punta a punta.
//
// VGRP-38 dispara revalidateTag(TAG_POR_ENTIDAD.videos) en cada escritura sobre
// `videos` desde el panel de admin (app/api/admin/contenido/videos[/:id]/route.ts);
// VGRP-29 lee esa misma tabla cacheada con unstable_cache + ese tag
// (lib/data/videos.ts). Este es el único punto de la suite que ejercita las DOS
// puntas juntas contra un servidor real: un admin CREA un video desde el panel,
// un usuario ve el título en Inicio, el admin lo EDITA desde el panel, y el
// usuario recarga y ve el cambio — sin ningún deploy de por medio.
//
// A propósito el video se crea (no sólo se edita) a través del panel real, no con
// un insert directo por service role: un insert directo no dispara
// revalidateTag(), así que si el proceso del server ya tenía la grilla de stage 2
// cacheada de una request anterior (muy posible en una suite E2E secuencial),
// esa fila nueva podría no aparecer todavía — lo cual rompería el test por una
// razón que no tiene nada que ver con la garantía que se quiere probar. Pasando
// TODA mutación (alta y edición) por el panel, cada paso deja el caché
// consistente antes de que el usuario navegue.
// =============================================================================

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!";

async function loginComo(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test("un admin crea y después edita un video desde /admin/contenido, y el usuario lo ve en /formacion sin deploy (revalidateTag real)", async ({
  page,
  browser,
}) => {
  // Dos logins completos (admin + usuario) y cuatro navegaciones: contra el dev
  // server local (que compila cada ruta la primera vez) tarda ~40s, más que los
  // 30s por defecto. Contra el build de CI sobra margen.
  test.setTimeout(60_000);

  // Prefijo "[test]": red de contención de test/helpers/cleanup.ts si la corrida se corta.
  const tituloOriginal = `[test] Video revalidate ${randomUUID()}`;
  const tituloNuevo = `[test] Video revalidado ${randomUUID()}`;

  // VGRP-59/60 (Bloque 13 — plan único): la policy de RLS de `videos`
  // (videos_select_con_acceso) ahora exige nivel='completo' — antes
  // 'principiante' ya alcanzaba.
  const usuario = await createAuthenticatedUser("completo");
  const contextoAdmin = await browser.newContext();
  const paginaAdmin = await contextoAdmin.newPage();

  try {
    // 1) El admin crea el video desde el panel real (stage 2 — la sección "Formación: armá
    // tu tienda" de /formacion). VGRP-88: /formacion solo muestra videos publicados y con
    // link, así que se cargan los dos desde el form.
    await loginComo(paginaAdmin, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);
    await paginaAdmin.goto("/admin/contenido/videos/nuevo");
    await paginaAdmin.getByLabel("Stage").selectOption("2");
    await paginaAdmin.getByLabel("Título").fill(tituloOriginal);
    await paginaAdmin.getByLabel(/Link del video/).fill("https://youtu.be/dQw4w9WgXcQ");
    await paginaAdmin.getByLabel("Publicado").check();
    await paginaAdmin.getByRole("button", { name: "Crear" }).click();
    await paginaAdmin.waitForURL("**/admin/contenido/videos");

    const { data: video, error: buscarError } = await admin
      .from("videos")
      .select("id")
      .eq("titulo", tituloOriginal)
      .eq("stage", 2)
      .single();
    expect(buscarError).toBeNull();
    const videoId = video?.id as string;
    expect(videoId).toBeTruthy();

    // Orden bien negativo para que quede primero en su stage (VGRP-88: ya no hay tope de
    // videos, pero así el test no depende de cuántos videos reales haya). Va directo por
    // service role (no por el reorden del panel, que reasignaría el orden de los videos
    // reales) y ANTES de la primera lectura: el create ya invalidó el tag, así que esa
    // primera lectura trae este orden.
    const { error: ordenError } = await admin
      .from("videos")
      .update({ orden: -999999 })
      .eq("id", videoId);
    expect(ordenError).toBeNull();

    // 2) El usuario carga /formacion (VGRP-88: los videos ya no están en Inicio): el
    // título ORIGINAL ya tiene que estar (el create de arriba ya revalidó el tag antes de
    // este punto) — ancla: si esto no aparece, el resto del test no prueba nada real.
    await loginComo(page, usuario.email, PASSWORD);
    await page.goto("/formacion");
    await expect(page.getByText(tituloOriginal)).toBeVisible();

    // 3) El admin edita el mismo video.
    await paginaAdmin.goto(`/admin/contenido/videos/${videoId}`);
    await paginaAdmin.getByLabel("Título").fill(tituloNuevo);
    await paginaAdmin.getByRole("button", { name: "Guardar cambios" }).click();
    await paginaAdmin.waitForURL("**/admin/contenido/videos");

    // 4) El usuario, en su propia sesión, recarga /formacion: sin ningún deploy,
    // revalidateTag ya invalidó la lectura cacheada.
    await page.reload();
    await expect(page.getByText(tituloNuevo)).toBeVisible();
    await expect(page.getByText(tituloOriginal)).toHaveCount(0);
  } finally {
    await contextoAdmin.close();
    await admin.from("videos").delete().eq("titulo", tituloNuevo);
    await admin.from("videos").delete().eq("titulo", tituloOriginal);
    await cleanupUser(usuario.userId);
  }
});
