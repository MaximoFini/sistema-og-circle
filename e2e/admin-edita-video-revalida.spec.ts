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
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test("un admin crea y después edita un video desde /admin/contenido, y el usuario lo ve en Inicio sin deploy (revalidateTag real)", async ({
  page,
  browser,
}) => {
  const tituloOriginal = `Video revalidate ${randomUUID()}`;
  const tituloNuevo = `Video revalidado ${randomUUID()}`;

  const usuario = await createAuthenticatedUser("principiante");
  const contextoAdmin = await browser.newContext();
  const paginaAdmin = await contextoAdmin.newPage();

  try {
    // 1) El admin crea el video desde el panel real (stage 2 — mismo stage que
    // renderiza InicioShell en la sección "Formación: armá tu tienda").
    await loginComo(paginaAdmin, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);
    await paginaAdmin.goto("/admin/contenido/videos/nuevo");
    await paginaAdmin.getByLabel("Stage").selectOption("2");
    await paginaAdmin.getByLabel("Título").fill(tituloOriginal);
    // Orden bien negativo a propósito: la grilla de stage 2 es de tamaño FIJO (3,
    // CANTIDAD_STAGE — lib/data/videos.ts) y corta por "orden" ascendente. Sin esto,
    // si ya hay 3+ videos de stage 2 reales cargados (contenido real de producción,
    // no sólo de test), este video quedaría afuera de la grilla por orden y el test
    // fallaría por una razón que no tiene nada que ver con revalidateTag.
    await paginaAdmin.getByLabel("Orden").fill("-999999");
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

    // 2) El usuario carga Inicio: el título ORIGINAL ya tiene que estar (el
    // create de arriba ya revalidó el tag antes de este punto) — ancla: si esto
    // no aparece, el resto del test no prueba nada real.
    await loginComo(page, usuario.email, PASSWORD);
    await expect(page.getByText(tituloOriginal)).toBeVisible();

    // 3) El admin edita el mismo video.
    await paginaAdmin.goto(`/admin/contenido/videos/${videoId}`);
    await paginaAdmin.getByLabel("Título").fill(tituloNuevo);
    await paginaAdmin.getByRole("button", { name: "Guardar cambios" }).click();
    await paginaAdmin.waitForURL("**/admin/contenido/videos");

    // 4) El usuario, en su propia sesión, recarga Inicio: sin ningún deploy,
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
