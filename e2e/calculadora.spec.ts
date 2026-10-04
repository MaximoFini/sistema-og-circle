import { expect, type Page, test } from "@playwright/test";
import "../test/helpers/load-env";
import { findSeedUser } from "../test/helpers/seed-users";

// =============================================================================
// VGRP-57 (D3) — la calculadora embebida en `/calculadora`, con UI real.
//
// Usa SOLO los usuarios fijos del seed (`pnpm db:seed:test`): no crea ni borra
// usuarios, sólo loguea, navega y cotiza (la cotización es cálculo en el
// cliente, no escribe nada en la base).
//
//  1. completo -> menú "Calculadora" -> /calculadora -> cotiza en courier
//     integral (el único régimen que no pasa por la IA) y ve el total en USD.
//  2. completo en Inicio -> "Abrir calculadora" es un link interno.
//  3. ninguno -> /calculadora termina en /comprar (middleware, RUTAS_CON_PLAN).
//  4. ninguno -> POST /api/cotizador/dolar da 403 (requierePlan en el endpoint).
//
// No depende de dolarapi: si el TC BNA automático no llegó, se carga a mano.
// =============================================================================

const COMPLETO = findSeedUser("completo");
const NINGUNO = findSeedUser("ninguno");

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

// Endpoints de la calculadora que llaman a un proveedor de IA, y hosts de IA
// que el navegador nunca debería tocar directo.
const RUTAS_IA =
  /\/api\/cotizador\/(identificar-ncm|sugerir-partidas|analisis-marketing|extraer-documento)/;
const HOSTS_IA = /(anthropic\.com|openai\.com|googleapis\.com\/.*generative|generativelanguage)/;

test.describe("calculadora embebida (VGRP-57)", () => {
  test("completo entra desde el menú y cotiza en courier integral sin llamar a la IA", async ({
    page,
  }) => {
    const requestsIa: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (RUTAS_IA.test(url) || HOSTS_IA.test(url)) requestsIa.push(url);
    });

    await login(page, COMPLETO.email, COMPLETO.password);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    const menu = page.getByRole("dialog", { name: "Navegación" });
    await menu.getByRole("link", { name: "Calculadora" }).click();

    await page.waitForURL("**/calculadora");
    await expect(
      page.getByRole("heading", { level: 1, name: "Calculadora de costos" }),
    ).toBeVisible();

    await page.getByRole("radio", { name: /^Courier integral/ }).check();
    await expect(
      page.getByRole("heading", { name: "Courier integral — todo incluido" }),
    ).toBeVisible();

    await page.getByLabel("Peso del paquete (kg)").fill("5");
    await page.getByLabel("Unidades (opcional)").fill("10");
    await page.getByLabel("Largo", { exact: true }).fill("40");
    await page.getByLabel("Ancho", { exact: true }).fill("30");
    await page.getByLabel("Alto", { exact: true }).fill("20");

    // TC BNA: el automático puede no llegar (dolarapi caído). Se espera a que
    // la carga termine (valor o aviso de falla) y, si quedó vacío, se llena.
    const dolar = page.getByLabel(/^TC BNA \(destino\)/);
    await expect(dolar).not.toHaveAttribute("placeholder", "Cargando…", { timeout: 15_000 });
    if ((await dolar.inputValue()) === "") await dolar.fill("1000");

    await page.getByRole("radio", { name: /^Miami/ }).check();

    const cotizar = page.getByRole("button", { name: "Cotizar" });
    await expect(cotizar).toBeEnabled();
    await cotizar.click();

    const resultado = page.getByRole("region", { name: "Resultado de la cotización" });
    await expect(
      resultado.getByRole("heading", { name: /Resumen — Courier integral · Miami/ }),
    ).toBeVisible();
    await expect(resultado.getByText("Total USD", { exact: true })).toBeVisible();
    const totalUsd = resultado.getByRole("definition").first();
    await expect(totalUsd).toHaveText(/US\$\s?[\d.,]+/);

    expect(requestsIa, "courier integral no debería llamar a la IA").toEqual([]);
  });

  test("el CTA 'Abrir calculadora' de Inicio es un link interno a /calculadora, sin target", async ({
    page,
  }) => {
    await login(page, COMPLETO.email, COMPLETO.password);

    const link = page.getByRole("link", { name: "Abrir calculadora" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/calculadora");
    await expect(link).not.toHaveAttribute("target", /.*/);
  });

  test("un usuario 'ninguno' que navega a /calculadora termina en /comprar", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    await page.goto("/calculadora");
    await page.waitForURL("**/comprar");
    expect(new URL(page.url()).pathname).toBe("/comprar");
  });

  test("un usuario 'ninguno' recibe 403 de POST /api/cotizador/dolar", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    const res = await page.request.post("/api/cotizador/dolar", { data: {} });
    expect(res.status()).toBe(403);
  });
});

// =============================================================================
// VGRP-58 (D3) — el cotizador marítimo, elegido con el selector adentro de
// /calculadora. Sin ruta propia: mismo entry point que VGRP-57.
//
//  1. completo -> /calculadora -> elige "Marítimo" -> carga volumen, peso,
//     FOB y TC a mano (sin escribir producto: cero llamadas a la IA, cero
//     dependencia de que el CDA responda) -> ve las dos opciones
//     (consolidado + full).
//  El caso "ninguno -> /comprar" ya lo prueba el describe de arriba: no hay
//  ruta nueva que probar, marítimo vive en la misma /calculadora.
// =============================================================================

test.describe("cotizador marítimo embebido (VGRP-58)", () => {
  test("completo elige 'Marítimo' en el selector y cotiza con datos manuales, sin IA", async ({
    page,
  }) => {
    const requestsIa: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (RUTAS_IA.test(url) || HOSTS_IA.test(url)) requestsIa.push(url);
    });

    await login(page, COMPLETO.email, COMPLETO.password);
    await page.goto("/calculadora");
    await expect(
      page.getByRole("heading", { level: 1, name: "Calculadora de costos" }),
    ).toBeVisible();

    // Courier es el default; el marítimo se carga recién al elegirlo
    // (next/dynamic — ver design-vgrp58.md → "Rendimiento y presupuesto de
    // bundle").
    await page.getByRole("radio", { name: /^Marítimo/ }).check();

    await page.getByLabel("Volumen (m³)").fill("8,501");
    await page.getByLabel("Peso bruto (kg)").fill("5500");
    await page.getByLabel("Unidades").fill("1");
    await page.getByLabel("Valor FOB (USD)").fill("18000");

    // TC del CDA: puede no llegar en el entorno de test (sin red de salida a
    // cda.org.ar). Se espera a que termine de intentar y, si quedó vacío, se
    // carga a mano — el mismo criterio que US-4 (nunca se inventa un valor).
    const tc = page.getByLabel(/^Tipo de cambio aduana/);
    await expect(tc).toBeVisible();
    await page.waitForTimeout(500);
    if ((await tc.inputValue()) === "") await tc.fill("1512");

    const cotizacion = page.getByRole("heading", { name: "Cotización" });
    await expect(cotizacion).toBeVisible();
    // Las dos opciones son botones (Opcion en MaritimoResultado.tsx); el
    // mismo texto también aparece en el título del desglose y en la tabla de
    // comparación de la hoja de impresión, así que hace falta acotar por rol
    // para no chocar con "strict mode" de Playwright.
    await expect(page.getByRole("button", { name: /^Marítimo consolidado/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Marítimo full/ })).toBeVisible();
    await expect(page.getByText(/US\$\s?[\d.,]+/).first()).toBeVisible();

    expect(requestsIa, "cotizar marítimo sin producto no debería llamar a la IA").toEqual([]);
  });
});
