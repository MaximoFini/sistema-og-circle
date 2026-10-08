import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-50 — cierre del Bloque 7: el circuito completo de revalidateTag, con
// browser real de punta a punta. Reescrito para el editor de videos del admin
// (specs/admin-videos-editor): ya no hay formularios separados de alta y edición.
//
// El admin toca una CASILLA VACÍA de la grilla de /admin/contenido/videos, completa
// el panel y lo CREA; un usuario ve el título en Inicio; el admin toca esa casilla,
// lo EDITA desde el mismo panel; y el usuario recarga y ve el cambio — sin ningún
// deploy de por medio. VGRP-38 dispara revalidateTag(TAG_POR_ENTIDAD.videos) en cada
// escritura sobre `videos`; VGRP-29 lee esa misma tabla cacheada con unstable_cache.
//
// Toda mutación (alta y edición) pasa por el panel real, no por un insert directo:
// un insert directo no dispara revalidateTag() y el server podría seguir sirviendo la
// grilla cacheada de una request anterior.
//
// Cupo: la grilla de Stage 2 tiene 3 casillas. La tabla `videos` es compartida con
// contenido real, así que si ya hay 3 videos PUBLICADOS en Stage 2 no existe una casilla
// vacía para tocar (el servidor tampoco deja publicar uno más). En ese caso el test se
// saltea con el motivo a la vista, en lugar de fallar por una razón ajena a revalidateTag.
// =============================================================================

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!";
const STAGE = 2;
const CUPO_STAGE_2 = 3;

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

test("un admin crea (casilla vacía) y después edita un video desde /admin/contenido/videos, y el usuario lo ve en Inicio sin deploy (revalidateTag real)", async ({
  page,
  browser,
}) => {
  // Dos logins completos (admin + usuario) y varias navegaciones: contra el dev server
  // local (que compila cada ruta la primera vez) tarda más que los 30s por defecto.
  test.setTimeout(90_000);

  const { count: publicados, error: errorCupo } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("stage", STAGE)
    .eq("publicado", true);
  expect(errorCupo).toBeNull();
  test.skip(
    (publicados ?? 0) >= CUPO_STAGE_2,
    "El Stage 2 ya tiene todas sus casillas ocupadas por videos publicados: no hay una casilla vacía que tocar.",
  );

  const tituloOriginal = `Video revalidate ${randomUUID()}`;
  const tituloNuevo = `Video revalidado ${randomUUID()}`;

  // VGRP-59/60 (Bloque 13 — plan único): la policy de RLS de `videos`
  // (videos_select_con_acceso) exige nivel='completo'.
  const usuario = await createAuthenticatedUser("completo");
  const contextoAdmin = await browser.newContext();
  const paginaAdmin = await contextoAdmin.newPage();

  try {
    // 1) El admin crea el video tocando una casilla vacía de Stage 2 (mismo stage que
    // renderiza InicioShell en "Formación: armá tu tienda").
    await loginComo(paginaAdmin, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);
    await paginaAdmin.goto("/admin/contenido/videos");
    await paginaAdmin
      .getByRole("button", { name: /Agregar un video en la casilla \d+ del Stage 2/ })
      .first()
      .click();

    const panel = paginaAdmin.getByRole("dialog");
    await expect(panel).toBeVisible();
    await panel.getByLabel("Título").fill(tituloOriginal);
    // "Publicado" arranca marcado al crear desde una casilla.
    await expect(panel.getByLabel("Publicado")).toBeChecked();
    await panel.getByRole("button", { name: "Agregar" }).click();
    await expect(panel).toBeHidden();

    // La casilla ya muestra el video nuevo (el estado se actualiza con la respuesta de la API).
    await expect(
      paginaAdmin.getByRole("button", { name: `Editar ${tituloOriginal}` }),
    ).toBeVisible();

    const { data: video, error: buscarError } = await admin
      .from("videos")
      .select("id, publicado, stage")
      .eq("titulo", tituloOriginal)
      .single();
    expect(buscarError).toBeNull();
    expect(video?.stage).toBe(STAGE);
    expect(video?.publicado).toBe(true);

    // 2) El usuario carga Inicio: el título ORIGINAL ya tiene que estar (el alta de arriba
    // ya revalidó el tag) — ancla: si esto no aparece, el resto del test no prueba nada.
    await loginComo(page, usuario.email, PASSWORD);
    await expect(page.getByText(tituloOriginal)).toBeVisible();

    // 3) El admin edita el mismo video tocando su casilla.
    await paginaAdmin.getByRole("button", { name: `Editar ${tituloOriginal}` }).click();
    await expect(panel).toBeVisible();
    await panel.getByLabel("Título").fill(tituloNuevo);
    await panel.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(panel).toBeHidden();
    await expect(paginaAdmin.getByRole("button", { name: `Editar ${tituloNuevo}` })).toBeVisible();

    // 4) El usuario, en su propia sesión, recarga Inicio: sin ningún deploy,
    // revalidateTag ya invalidó la lectura cacheada.
    await page.reload();
    await expect(page.getByText(tituloNuevo)).toBeVisible();
    await expect(page.getByText(tituloOriginal)).toHaveCount(0);

    // 5) El admin DESPUBLICA el video desde el panel: sale de la grilla (libera la casilla)
    // y el usuario deja de verlo en Inicio.
    await paginaAdmin.getByRole("button", { name: `Editar ${tituloNuevo}` }).click();
    await panel.getByRole("button", { name: "Despublicar" }).click();
    await expect(panel).toBeHidden();
    await expect(paginaAdmin.getByText(/Despublicados \(\d+\)/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(tituloNuevo)).toHaveCount(0);
  } finally {
    await contextoAdmin.close();
    await admin.from("videos").delete().eq("titulo", tituloNuevo);
    await admin.from("videos").delete().eq("titulo", tituloOriginal);
    await cleanupUser(usuario.userId);
  }
});
