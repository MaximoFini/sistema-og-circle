import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-52 (cubre VGRP-33) — `/perfil` (Server Component) y `PerfilForm`, sólo
// probables en browser real (leen `getVerifiedClaims()`/cookies, como el resto de
// `app/(app)/*`). `actualizarPerfil()` en sí ya tiene tests de integración reales
// contra la base en test/integration/perfil-actions.test.ts — acá el foco es lo que
// sólo se puede probar con un browser real: el render por nivel y el round-trip del
// form.
// =============================================================================

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("test-password-1!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("/perfil — VGRP-52", () => {
  test("sin sesión: el middleware redirige a /login (fail-closed) antes de que la página pueda responder nada — el notFound() de page.tsx es defensa en profundidad, no alcanzable así en un flujo real de browser", async ({
    page,
  }) => {
    // Hallazgo documentado (no un bug): el ticket pedía confirmar "sin sesión ->
    // notFound() (404, no 500)", pero middleware.ts (VGRP-17) ya es fail-closed sobre
    // TODA ruta no listada en PUBLIC_ROUTES/PUBLIC_PREFIXES — /perfil no está ahí, así
    // que un browser real nunca llega a ejecutar PerfilPage() sin sesión: siempre
    // rebota a /login antes. El notFound() de page.tsx (guard `if (!claims)`) queda
    // como defensa en profundidad para un escenario que la capa de arriba ya cierra —
    // mismo tipo de hallazgo que docs/TESTING.md ya documenta para
    // requireAdmin()/middleware en el Bloque 6 ("ambas capas protegen la MISMA
    // request").
    await page.goto("/perfil");
    await page.waitForURL(/\/login\?next=%2Fperfil/);
  });

  test("nivel 'ninguno': mensaje de compra + CTA 'Comprar acceso'; sin lista de accesos ni 'Mejorar mi nivel'; el link de soporte usa links.whatsapp", async ({
    page,
  }) => {
    const usuario = await createAuthenticatedUser("ninguno");
    try {
      await loginComo(page, usuario.email);
      await page.goto("/perfil");

      await expect(page.getByText("Nivel activo:")).toBeVisible();

      const accesos = page.getByRole("region", { name: "Accesos habilitados" });
      await expect(
        accesos.getByText(
          "Todavía no tenés ningún nivel activo — comprá tu acceso para desbloquear la plataforma.",
        ),
      ).toBeVisible();
      await expect(accesos.getByRole("link", { name: "Comprar acceso" })).toBeVisible();
      await expect(accesos.getByRole("link", { name: "Mejorar mi nivel" })).toHaveCount(0);
      // Sin nivel, ninguna de las dos <ul> de accesos se renderiza.
      await expect(accesos.locator("ul")).toHaveCount(0);

      // Soporte: mismo link que el resto de la plataforma (getLinks(), lib/config),
      // nunca un número hardcodeado propio de esta pantalla. Edge Config no está
      // vinculada en este entorno de test (mismo límite ya documentado para
      // VGRP-31/VGRP-39 en lib/config/index.ts) — getLinks() cae al DEFAULT_LINKS.whatsapp
      // fijado ahí mismo, que es exactamente lo que se compara acá.
      await expect(page.getByRole("link", { name: "Escribinos por WhatsApp" })).toHaveAttribute(
        "href",
        "https://wa.me/5491100000000",
      );
    } finally {
      await cleanupUser(usuario.userId);
    }
  });

  test("nivel 'principiante': ACCESOS_PRINCIPIANTE en la lista principal + bloque 'Avanzado suma, además:' aparte, con el CTA de mejora — nunca mezclados", async ({
    page,
  }) => {
    const usuario = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, usuario.email);
      await page.goto("/perfil");

      const accesos = page.getByRole("region", { name: "Accesos habilitados" });
      await expect(accesos.getByText("Formación completa (11 videos)")).toBeVisible();
      await expect(accesos.getByText("Calculadora de costos")).toBeVisible();
      await expect(accesos.getByText("Directorio de profesionales")).toBeVisible();
      await expect(accesos.getByText("Servicios financieros")).toBeVisible();

      await expect(accesos.getByText("Avanzado suma, además:")).toBeVisible();
      await expect(accesos.getByText("Depósitos en Miami, China y España")).toBeVisible();
      await expect(accesos.getByText("Agente de muestras y de volumen")).toBeVisible();
      await expect(accesos.getByText("Flete y despacho gestionado")).toBeVisible();
      await expect(accesos.getByText("Tracking marítimo")).toBeVisible();
      await expect(accesos.getByText("Datos SWIFT")).toBeVisible();

      await expect(accesos.getByRole("link", { name: "Mejorar mi nivel" })).toBeVisible();
      await expect(accesos.getByRole("link", { name: "Comprar acceso" })).toHaveCount(0);

      // "Nunca mezclados" en forma estructural: dos <ul> separadas (principal + "suma
      // además"), no una sola lista combinada (eso es lo que hace 'avanzado').
      await expect(accesos.locator("ul")).toHaveCount(2);
    } finally {
      await cleanupUser(usuario.userId);
    }
  });

  test("nivel 'avanzado': ambas listas juntas en una sola <ul>, sin el bloque de mejora ni su CTA", async ({
    page,
  }) => {
    const usuario = await createAuthenticatedUser("avanzado");
    try {
      await loginComo(page, usuario.email);
      await page.goto("/perfil");

      const accesos = page.getByRole("region", { name: "Accesos habilitados" });
      await expect(accesos.getByText("Formación completa (11 videos)")).toBeVisible();
      await expect(accesos.getByText("Datos SWIFT")).toBeVisible();

      await expect(accesos.getByText("Avanzado suma, además:")).toHaveCount(0);
      await expect(accesos.getByRole("link", { name: "Mejorar mi nivel" })).toHaveCount(0);
      await expect(accesos.getByRole("link", { name: "Comprar acceso" })).toHaveCount(0);

      await expect(accesos.locator("ul")).toHaveCount(1);
    } finally {
      await cleanupUser(usuario.userId);
    }
  });

  test("PerfilForm precargado con nombre/teléfono actuales; editar y guardar refleja el cambio tras recargar (round-trip real)", async ({
    page,
  }) => {
    const usuario = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, usuario.email);
      await page.goto("/perfil");

      // createAuthenticatedUser no setea nombre/telefono (sólo email, ver test/helpers/
      // auth.ts) — precargado con los valores reales de profiles (strings vacíos), no
      // con placeholders inventados por el test.
      await expect(page.getByLabel("Nombre")).toHaveValue("");
      await expect(page.getByLabel("Teléfono")).toHaveValue("");

      const nuevoNombre = `Nombre E2E ${Date.now()}`;
      const nuevoTelefono = "+54 9 11 4444-8888";
      await page.getByLabel("Nombre").fill(nuevoNombre);
      await page.getByLabel("Teléfono").fill(nuevoTelefono);
      await page.getByRole("button", { name: "Guardar cambios" }).click();

      await expect(page.getByText("Guardado.")).toBeVisible();

      await page.reload();
      await expect(page.getByLabel("Nombre")).toHaveValue(nuevoNombre);
      await expect(page.getByLabel("Teléfono")).toHaveValue(nuevoTelefono);
    } finally {
      await cleanupUser(usuario.userId);
    }
  });

  test("'Cerrar sesión' desde /perfil dispara el mismo cerrarSesion() que el resto del repo", async ({
    page,
  }) => {
    const usuario = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, usuario.email);
      await page.goto("/perfil");

      await page.getByRole("button", { name: "Cerrar sesión" }).click();
      await page.waitForURL("**/login");

      // La sesión quedó realmente cerrada, no sólo la UI: /dashboard sin sesión rebota
      // a /login (middleware.ts fail-closed, VGRP-17) — mismo criterio que
      // dashboard-shell.spec.ts.
      await page.goto("/dashboard");
      await page.waitForURL(/\/login\?next=%2Fdashboard/);
    } finally {
      await cleanupUser(usuario.userId);
    }
  });
});
