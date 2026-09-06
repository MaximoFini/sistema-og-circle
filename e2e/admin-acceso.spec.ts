import { expect, test } from "@playwright/test";
import { SEED_ADMIN_USER, SEED_USERS } from "../test/helpers/seed-users";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-35 (35-T13) — protección de `/admin` por rol, con UI real.
//
// Usa los usuarios fijos del seed (`pnpm db:seed:test`). No crea ni borra
// usuarios: sólo loguea y navega.
//
//  1. principiante@test... (rol='user') -> /admin devuelve 404, no el panel.
//  2. admin@test...        (rol='admin') -> /admin muestra el shell y la nav.
// =============================================================================

const PRINCIPIANTE = SEED_USERS.find((u) => u.nivel === "principiante" && u.rol === "user");

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("acceso a /admin por rol", () => {
  test("un usuario con rol='user' ve un 404 en /admin, nunca el panel", async ({ page }) => {
    if (!PRINCIPIANTE) throw new Error("Falta el usuario seed 'principiante'.");
    await login(page, PRINCIPIANTE.email, PRINCIPIANTE.password);

    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);

    // Nada del shell del panel a la vista.
    await expect(page.getByText("Panel · OG Circle")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Secciones del panel" })).toHaveCount(0);
  });

  test("el usuario admin ve el shell del panel y la nav", async ({ page }) => {
    await login(page, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);

    const res = await page.goto("/admin");
    expect(res?.status()).toBe(200);

    await expect(page.getByText("Panel · OG Circle")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Secciones del panel" });
    await expect(nav.getByRole("link", { name: "Usuarios" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Pagos" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Auditoría" })).toBeVisible();
  });
});
