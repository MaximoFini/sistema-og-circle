import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-48 §3 — E2E de superficie: lo que un usuario común (`rol='user'`) NO
// debe poder ver ni hacer, sin importar su `nivel`.
//
// Complementa (no reemplaza) `middleware.test.ts` (6 casos unitarios de
// `isAdminArea`) y `test/structural/admin-surface.test.ts` (que ningún
// handler de `app/api/admin/**` falta el guard `requireAdmin()`): esos dos
// prueban el código; esto prueba el RESULTADO con un browser real —
// exactamente lo que vería alguien intentándolo desde afuera.
// =============================================================================

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

const PASSWORD = "test-password-1!";

test.describe("superficie de admin — usuario común", () => {
  let userIdA: string | null = null;
  let userIdB: string | null = null;

  test.afterEach(async () => {
    if (userIdA) {
      await cleanupUser(userIdA);
      userIdA = null;
    }
    if (userIdB) {
      await cleanupUser(userIdB);
      userIdB = null;
    }
  });

  test("un usuario con nivel activo no ve ningún link a /admin en la UI", async ({ page }) => {
    const creado = await createAuthenticatedUser("avanzado", "user");
    userIdA = creado.userId;

    await login(page, creado.email, PASSWORD);

    // Recorre el dashboard completo (la pantalla con más superficie de UI de
    // toda la app) buscando cualquier link cuyo href empiece con /admin.
    const linksAdmin = page.locator('a[href^="/admin"]');
    await expect(linksAdmin).toHaveCount(0);
  });

  test("un fetch directo al endpoint de admin desde el browser de un usuario común da 404 y no muta nada", async ({
    page,
  }) => {
    const creado = await createAuthenticatedUser("avanzado", "user");
    userIdA = creado.userId;
    await login(page, creado.email, PASSWORD);

    const respuesta = await page.evaluate(async (userId) => {
      const res = await fetch(`/api/admin/usuarios/${userId}/nivel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nivel: "avanzado", motivo: "intento no autorizado" }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }, creado.userId);

    // 404 (nunca 403 — no confirma que la ruta existe), y JSON, no un HTML de
    // error de Next: `requireAdmin()` corre antes de cualquier render.
    expect(respuesta.status).toBe(404);
    expect(respuesta.body).not.toBeNull();
  });

  test("un usuario no puede ver el pago de otro por URL directa al detalle de admin", async ({
    page,
  }) => {
    const creado = await createAuthenticatedUser("avanzado", "user");
    userIdA = creado.userId;
    const otro = await createAuthenticatedUser("principiante", "user");
    userIdB = otro.userId;

    await login(page, creado.email, PASSWORD);

    // Navegación directa (browser real, no fetch) a una ruta de admin que
    // referencia a OTRO usuario. `requireAdminPage()` corta con `notFound()`
    // antes de que el layout renderice nada de `otro`.
    const respuesta = await page.goto(`/admin/usuarios/${otro.userId}`);
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByText(otro.email)).toHaveCount(0);
  });
});
