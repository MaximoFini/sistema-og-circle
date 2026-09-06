import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-36 (36-T13) — activación manual de nivel, con UI real.
//
// El admin busca un usuario por email, abre la ficha, cambia el nivel con un
// motivo y ve la confirmación + el nivel nuevo reflejado.
//
// El usuario objetivo se crea ad hoc (createAuthenticatedUser) y se limpia al
// final — no se toca ningún usuario del seed.
// =============================================================================

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test("el admin activa el nivel de un usuario indicando un motivo", async ({ page }) => {
  const objetivo = await createAuthenticatedUser("ninguno");

  try {
    await login(page, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);

    await page.goto(`/admin/usuarios?q=${encodeURIComponent(objetivo.email)}`);
    await page.getByRole("link", { name: objetivo.email }).click();
    await page.waitForURL(`**/admin/usuarios/${objetivo.userId}`);

    await page.getByLabel("Nivel").selectOption("avanzado");
    await page.getByLabel("Motivo").fill("Pagó por transferencia bancaria, sin webhook.");
    await page.getByRole("button", { name: "Aplicar cambio" }).click();

    await expect(page.getByText(/Nivel actualizado: ninguno → avanzado/)).toBeVisible();
    await expect(page.getByText("Nivel vigente:").locator("..")).toContainText("avanzado");
  } finally {
    await cleanupUser(objetivo.userId);
  }
});
