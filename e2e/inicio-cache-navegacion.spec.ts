import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import "../test/helpers/load-env";

// Caché de cliente entre navegaciones (lib/cliente/cache-datos.ts, docs/RENDIMIENTO.md):
// la primera visita a Inicio pide las grillas y el progreso; volver a Inicio desde
// Formación los pinta al instante desde memoria, sin repetir ningún pedido ni mostrar
// "Cargando…".

const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser
const ENDPOINTS = ["/api/agentes", "/api/profesionales", "/api/servicios-financieros"];

test("volver a Inicio desde Formación no repite los pedidos de las grillas", async ({ page }) => {
  const user = await createAuthenticatedUser("completo");
  const pedidos: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (ENDPOINTS.includes(url.pathname)) pedidos.push(url.pathname);
  });

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.waitForURL("**/dashboard");

    // Primera visita: cada endpoint una vez, y las grillas salen de "Cargando…".
    await expect(page.getByText("Cargando agentes…")).toHaveCount(0);
    await expect(page.getByText("Cargando profesionales…")).toHaveCount(0);
    await expect(page.getByText("Cargando servicios…")).toHaveCount(0);
    expect([...pedidos].sort()).toEqual([...ENDPOINTS].sort());

    // Ida y vuelta por navegación de cliente (el link del header, no page.goto).
    await page.getByRole("link", { name: "Formación", exact: true }).first().click();
    await page.waitForURL("**/formacion");
    await page.getByRole("link", { name: "Inicio", exact: true }).first().click();
    await page.waitForURL("**/dashboard");

    // Al volver: sin "Cargando…" en ningún momento y sin pedidos nuevos.
    await expect(page.getByText("Cargando agentes…")).toHaveCount(0);
    await expect(page.getByLabel("Cargando tu progreso")).toHaveCount(0);
    expect(pedidos).toHaveLength(ENDPOINTS.length);
  } finally {
    await cleanupUser(user.userId);
  }
});
