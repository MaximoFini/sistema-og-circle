import { expect, type Locator, type Page, test } from "@playwright/test";
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
//  3. ninguno -> /calculadora se ve bloqueada, sin redirect (VGRP-77).
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

/** Texto del mensaje de un link `wa.me/?text=…`, ya decodificado. */
async function textoWhatsapp(link: Locator): Promise<string> {
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  return new URL(href ?? "").searchParams.get("text") ?? "";
}

/** TC BNA: el automático puede no llegar (dolarapi caído); si quedó vacío, se carga a mano. */
async function completarDolar(page: Page): Promise<void> {
  const dolar = page.getByLabel(/^TC BNA \(destino\)/);
  await expect(dolar).not.toHaveAttribute("placeholder", "Cargando…", { timeout: 15_000 });
  if ((await dolar.inputValue()) === "") await dolar.fill("1000");
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

    // VGRP-69: el WhatsApp habla como OG Circle y el contacto sale de la config.
    const texto = await textoWhatsapp(resultado.getByRole("link", { name: "Enviar por WhatsApp" }));
    expect(texto).toMatch(/^\*OG Circle — Cotización OG-\d{8}-\d{4}\*/);
    expect(texto).toContain("Courier Integral Todo Incluido");
    expect(texto).not.toMatch(/vegroup|7639/i);

    expect(requestsIa, "courier integral no debería llamar a la IA").toEqual([]);
  });

  // VGRP-69 — régimen comercial, el que pasa por la IA. La IA está mockeada
  // con page.route: sin ANTHROPIC_API_KEY y sin costo. `identificar-ncm`
  // devuelve el primer candidato que le manda el front, así la posición
  // siempre existe en la base local.
  test("completo cotiza en courier comercial con la IA mockeada: NCM, desglose, PDF y WhatsApp", async ({
    page,
  }) => {
    await page.route("**/api/cotizador/sugerir-partidas", (route) =>
      route.fulfill({ json: { partidas: ["8518"], interpretacion: "auriculares" } }),
    );
    await page.route("**/api/cotizador/identificar-ncm", async (route) => {
      const { candidates } = route.request().postDataJSON() as {
        candidates: { ncm: string }[];
      };
      await route.fulfill({
        json: {
          ncm: candidates[0]?.ncm,
          confianza: 87,
          razonamiento: "Mock de E2E.",
          alternativas: [],
        },
      });
    });

    await login(page, COMPLETO.email, COMPLETO.password);
    await page.goto("/calculadora");

    // "Courier comercial" es el régimen por defecto.
    await page.getByLabel("Descripción del producto").fill("auriculares bluetooth");
    await expect(page.getByText(/Probabilidad: 87%/)).toBeVisible({ timeout: 15_000 });
    const sim = (await page.locator("[class*='ncmCodigo']").first().textContent())?.trim() ?? "";
    expect(sim).not.toBe("");

    await page.getByLabel("Precio FOB (USD)").fill("200");
    await page.getByLabel("Peso del paquete (kg)").fill("3");
    await page.getByLabel("Unidades totales").fill("10");
    await page.getByLabel("Largo", { exact: true }).fill("40");
    await page.getByLabel("Ancho", { exact: true }).fill("30");
    await page.getByLabel("Alto", { exact: true }).fill("20");
    await completarDolar(page);
    await page.getByRole("radio", { name: /^Miami/ }).check();
    await page.getByRole("button", { name: "Cotizar" }).click();

    const resultado = page.getByRole("region", { name: "Resultado de la cotización" });
    await expect(
      resultado.getByRole("heading", { name: /Resumen — depósito Miami/ }),
    ).toBeVisible();
    await expect(resultado.getByRole("button", { name: "Descargar PDF" })).toBeVisible();

    // Glosario de conceptos: cerrado por defecto, se abre con teclado.
    const conceptos = resultado.getByText("¿Qué significa cada concepto?");
    await conceptos.focus();
    await page.keyboard.press("Enter");
    await expect(resultado.getByText("Peso volumétrico", { exact: true })).toBeVisible();

    const texto = await textoWhatsapp(resultado.getByRole("link", { name: "Enviar por WhatsApp" }));
    expect(texto).toContain("*OG Circle — Cotización OG-");
    expect(texto).toContain(`Posición NCM: ${sim}`);
    expect(texto).toContain("Producto: auriculares bluetooth");
    expect(texto).not.toMatch(/vegroup|7639/i);

    // La hoja imprimible (oculta en pantalla) ya no dice VEGROUP.
    const hoja = page.locator("[data-quote-doc]");
    await expect(hoja).toContainText("OG Circle");
    await expect(hoja).not.toContainText(/vegroup/i);
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

  // VGRP-77: antes redirigía a /comprar; ahora ve la calculadora real, borrosa
  // e inerte, con la tarjeta de desbloqueo (el detalle, en
  // e2e/plataforma-bloqueada.spec.ts).
  test("un usuario 'ninguno' que navega a /calculadora la ve bloqueada, sin redirect", async ({
    page,
  }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    await page.goto("/calculadora");
    expect(new URL(page.url()).pathname).toBe("/calculadora");
    await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprar acceso" })).toBeVisible();
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
//  El caso "ninguno" ya lo prueba el describe de arriba: no hay ruta nueva
//  que probar, marítimo vive en la misma /calculadora.
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

    // VGRP-69: "Enviar por WhatsApp" del resultado, con las dos opciones. El
    // link al despachante (wa.me/<número>) es otro y sigue aparte.
    const texto = await textoWhatsapp(page.getByRole("link", { name: "Enviar por WhatsApp" }));
    expect(texto).toMatch(/^\*OG Circle — Cotización marítima MAR-\d{6}\*/);
    expect(texto).toContain("Carga: 8,501 m³");
    expect(texto).toContain("*Consolidado (LCL):*");
    expect(texto).toMatch(/\*Full \(FCL, .+\):\*.*\(estimado\)/);
    expect(texto).not.toMatch(/vegroup/i);

    expect(requestsIa, "cotizar marítimo sin producto no debería llamar a la IA").toEqual([]);
  });

  // VGRP-70 — identificar el producto con una foto. La IA está mockeada (foto,
  // partidas y NCM): sin clave y sin costo. La foto es un PNG de 1×1 generado
  // acá; el navegador la achica/re-codifica a JPEG igual que una real.
  test("completo identifica el producto con una foto y la NCM se detecta sola", async ({
    page,
  }) => {
    let mediaTypeRecibido = "";
    await page.route("**/api/cotizador/identificar-producto", async (route) => {
      mediaTypeRecibido = (route.request().postDataJSON() as { mediaType: string }).mediaType;
      await route.fulfill({
        json: {
          producto: "taladro percutor eléctrico",
          detalle: "Herramienta eléctrica de mano con mandril",
          confianza: 91,
          dudas: "No se ve la potencia.",
        },
      });
    });
    await page.route("**/api/cotizador/sugerir-partidas", (route) =>
      route.fulfill({ json: { partidas: ["8467"], interpretacion: "taladro" } }),
    );
    await page.route("**/api/cotizador/identificar-ncm", async (route) => {
      const { candidates } = route.request().postDataJSON() as { candidates: { ncm: string }[] };
      await route.fulfill({
        json: { ncm: candidates[0]?.ncm, confianza: 80, razonamiento: "Mock.", alternativas: [] },
      });
    });

    await login(page, COMPLETO.email, COMPLETO.password);
    await page.goto("/calculadora");
    await page.getByRole("radio", { name: /^Marítimo/ }).check();

    await expect(page.getByRole("button", { name: "Identificar con una foto" })).toBeVisible();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "taladro.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1X1, "base64"),
    });

    const descripcion = page.getByLabel("Descripción del producto");
    await expect(descripcion).toHaveValue(
      "taladro percutor eléctrico. Herramienta eléctrica de mano con mandril",
    );
    await expect(page.getByText("Lo que vemos en la foto")).toBeVisible();
    await expect(page.getByText(/Para afinar: No se ve la potencia\./)).toBeVisible();
    expect(mediaTypeRecibido).toBe("image/jpeg");

    // El texto nuevo dispara la detección de NCM de siempre.
    await expect(page.getByText(/Probabilidad: 80%/)).toBeVisible({ timeout: 15_000 });
  });
});

/** PNG válido de 1×1 px (transparente). */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
