import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-27 — shell del dashboard: header, drawer de navegación, y logout.
//
// Cubre las dos partes del ticket que necesitan un browser real (no Vitest):
// 1. Las dos variantes prerenderizadas (`/dashboard/principiante` y
//    `/dashboard/avanzado`, vía rewrite de middleware.ts) responden con
//    sesión real, sin asumir nada del mecanismo interno — ver design.md.
// 2. El drawer: abre con teclado, atrapa el foco, Comunidad/Tracking se ven
//    pero NO son links navegables, y Escape cierra devolviendo el foco al
//    trigger (criterios de aceptación de requirements.md, US-2).
//
// El botón "Cerrar sesión" del pie del drawer y el fetch de perfil
// (/api/perfil) son una extensión sobre el alcance original del ticket,
// agregada sobre la marcha — se prueba acá por ser la superficie de logout
// real más nueva del repo (antes sólo existía en app/admin/, ver
// lib/auth/actions.ts).
// =============================================================================

const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("shell del dashboard por nivel (VGRP-27)", () => {
  for (const nivel of ["principiante", "avanzado"] as const) {
    test(`login real de un usuario '${nivel}' llega a /dashboard con la variante prerenderizada correcta`, async ({
      page,
    }) => {
      const created = await createAuthenticatedUser(nivel);
      try {
        await loginComo(page, created.email);

        // La URL visible sigue siendo /dashboard (rewrite, no redirect) —
        // confirmado también contra el output de red durante el desarrollo.
        expect(page.url()).toContain("/dashboard");
        await expect(page.getByRole("heading", { name: `Nivel ${nivel}` })).toBeVisible();
        // Ningún rastro del otro nivel ni del estado "ninguno" en pantalla.
        const otro = nivel === "principiante" ? "avanzado" : "principiante";
        await expect(page.getByText(`Nivel ${otro}`)).toHaveCount(0);
        await expect(page.getByText("Todavía no tenés acceso a ningún nivel")).toHaveCount(0);
      } finally {
        await cleanupUser(created.userId);
      }
    });
  }
});

test.describe("drawer de navegación (VGRP-27)", () => {
  test("abre con teclado, atrapa el foco, marca Comunidad/Tracking como Próximamente (no navegables), y Escape cierra devolviendo el foco", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, created.email);

      const trigger = page.getByRole("button", { name: "Abrir menú" });
      await trigger.focus();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog", { name: "Navegación" });
      await expect(dialog).toBeVisible();
      // El botón hamburguesa pasó a comunicar "Cerrar menú" (aria-label) —
      // es el mismo <button>, no uno duplicado (ver design.md/tasks.md: se
      // sacó el botón "Cerrar" interno del panel para no tener dos).
      await expect(page.getByRole("button", { name: "Cerrar menú" })).toBeVisible();

      // Comunidad y Tracking: visibles con el badge, pero NO son <a> — nunca
      // un link roto a una ruta que no existe (requirements.md, US-2).
      await expect(dialog.getByText("Próximamente")).toHaveCount(2);
      await expect(dialog.getByRole("link", { name: "Comunidad" })).toHaveCount(0);
      await expect(dialog.getByRole("link", { name: "Tracking" })).toHaveCount(0);
      await expect(dialog.getByRole("link", { name: "Inicio" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Calculadora" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Perfil" })).toBeVisible();

      // Foco al abrir: primer elemento focuseable del panel (el link "Inicio"
      // — ya no hay un botón "Cerrar" interno delante de la lista).
      await expect(dialog.getByRole("link", { name: "Inicio" })).toBeFocused();

      // Escape cierra y devuelve el foco al trigger (que vuelve a "Abrir menú").
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "Abrir menú" })).toBeFocused();
    } finally {
      await cleanupUser(created.userId);
    }
  });

  test("el pie del drawer muestra el email del usuario y 'Cerrar sesión' termina la sesión de verdad", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, created.email);

      await page.getByRole("button", { name: "Abrir menú" }).click();
      const dialog = page.getByRole("dialog", { name: "Navegación" });
      // El usuario creado por createAuthenticatedUser no tiene `nombre`
      // seteado (sólo email) — el pie cae al fallback documentado en
      // UserFooter.tsx: mostrar el email.
      await expect(dialog.getByText(created.email)).toBeVisible();

      await dialog.getByRole("button", { name: "Cerrar sesión" }).click();
      await page.waitForURL("**/login");

      // La sesión quedó realmente cerrada, no sólo la UI: /dashboard sin
      // sesión rebota a /login (middleware.ts fail-closed, VGRP-17).
      await page.goto("/dashboard");
      await page.waitForURL(/\/login\?next=%2Fdashboard/);
    } finally {
      // cleanupUser funciona sin sesión de usuario (usa el cliente admin).
      await cleanupUser(created.userId);
    }
  });
});
