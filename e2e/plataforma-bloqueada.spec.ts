import { expect, type Page, test } from "@playwright/test";
import "../test/helpers/load-env";
import { createTestAdminClient } from "../test/helpers/db-client";
import { findSeedUser } from "../test/helpers/seed-users";

// =============================================================================
// VGRP-77 — plataforma borrosa sin plan: anti-fuga.
//
// Sin plan, Inicio y Calculadora se ven de fondo, borrosos e inertes, con la
// tarjeta de desbloqueo encima. El blur es SÓLO presentación: lo que llega al
// navegador se lee con F12. Por eso este spec no mira el DOM para lo sensible
// sino el BODY CRUDO de la respuesta (HTML y payload RSC) — lo que se mandó,
// se vea o no.
//
// Usa los usuarios fijos del seed (`pnpm db:seed:test`): sólo loguea y lee.
// =============================================================================

const NINGUNO = findSeedUser("ninguno");
const COMPLETO = findSeedUser("completo");

const EMBED = /youtube(-nocookie)?\.com\/embed\//;
// VGRP-88: /formacion se suma con el mismo esquema por nivel.
const RUTAS = ["/dashboard", "/calculadora", "/formacion"] as const;
// Un archivo de materiales nunca viaja al navegador: ni el path del bucket ni una URL firmada.
const ARCHIVO_MATERIAL = /archivos\/[0-9a-f-]{36}\.|\/storage\/v1\/object\/sign\//;

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

/** HTML del primer request + payload RSC de una navegación de cliente. */
async function cuerposCrudos(page: Page, ruta: string): Promise<string[]> {
  const html = await page.request.get(ruta);
  const rsc = await page.request.get(ruta, { headers: { RSC: "1" } });
  expect(html.status()).toBe(200);
  expect(rsc.status()).toBe(200);
  return [await html.text(), await rsc.text()];
}

/** Contactos reales cargados (agentes y profesionales): no pueden aparecer sin plan. */
async function contactosReales(): Promise<string[]> {
  const admin = createTestAdminClient();
  const [agentes, profesionales] = await Promise.all([
    admin.from("agentes").select("contacto"),
    admin.from("profesionales").select("contacto"),
  ]);
  if (agentes.error) throw agentes.error;
  if (profesionales.error) throw profesionales.error;
  return [...agentes.data, ...profesionales.data]
    .map((fila) => fila.contacto?.trim())
    .filter((c): c is string => !!c && c.length >= 6);
}

test.describe("plataforma bloqueada sin plan (VGRP-77)", () => {
  test("Inicio: tarjeta de desbloqueo con el botón de compra y el fondo inerte", async ({
    page,
  }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprar acceso" })).toBeVisible();

    // Qué incluye el plan, con el logo de quien opera cada beneficio.
    const incluye = page.getByRole("list", { name: "Qué incluye" });
    await expect(incluye.getByRole("listitem")).toHaveCount(9);
    for (const partner of ["VeGroup", "Belo", "Traxcargo"]) {
      await expect(incluye.getByRole("img", { name: partner })).toBeVisible();
    }

    const fondo = page.locator("[inert]");
    await expect(fondo).toHaveCount(1);
    await expect(fondo).toHaveAttribute("aria-hidden", "true");

    // Nada del fondo recibe foco (ni un video, ni "Abrir calculadora").
    const interactivos = fondo.locator("a, button");
    expect(await interactivos.count()).toBeGreaterThan(0);
    await interactivos.first().focus();
    const focoAdentro = await fondo.evaluate((el) => el.contains(document.activeElement));
    expect(focoAdentro).toBe(false);
  });

  test("Calculadora: se ve bloqueada en /calculadora, sin redirect", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);
    // Ninguna llamada a /api/cotizador/* desde el fondo: un 403 ahí hace que
    // lib/cotizador/api.ts mande a /comprar (bug real, detectado a mano).
    const llamadasCotizador: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/cotizador/")) llamadasCotizador.push(req.url());
    });

    await page.goto("/calculadora");
    await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toBeVisible();
    await expect(page.locator("[inert]")).toHaveCount(1);

    // Se queda en la página (antes, a los segundos, terminaba en /comprar).
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/calculadora");
    expect(llamadasCotizador).toEqual([]);
  });

  // VGRP-88 — /formacion sin plan: la pantalla real borrosa, con los materiales listados
  // pero sin poder descargarlos (US-6).
  test("Formación: se ve bloqueada en /formacion, con los botones de descarga deshabilitados", async ({
    page,
  }) => {
    await login(page, NINGUNO.email, NINGUNO.password);
    await page.goto("/formacion");

    await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toBeVisible();
    const fondo = page.locator("[inert]");
    await expect(fondo).toHaveCount(1);
    // El fondo es `inert`: queda fuera del árbol de accesibilidad, así que getByRole no lo
    // ve. Se busca por texto y por atributo.
    await expect(fondo.getByText("Materiales adicionales", { exact: true })).toBeAttached();

    for (const boton of await fondo.locator('button[aria-label^="Descargar "]').all()) {
      await expect(boton).toBeDisabled();
    }
  });

  test("ni el HTML ni el payload RSC traen URLs de embed, contactos ni archivos de materiales", async ({
    page,
  }) => {
    const contactos = await contactosReales();
    await login(page, NINGUNO.email, NINGUNO.password);

    for (const ruta of RUTAS) {
      for (const cuerpo of await cuerposCrudos(page, ruta)) {
        expect(cuerpo, `${ruta} trae una URL de embed`).not.toMatch(EMBED);
        expect(cuerpo, `${ruta} trae un archivo de materiales`).not.toMatch(ARCHIVO_MATERIAL);
        for (const contacto of contactos) {
          expect(cuerpo.includes(contacto), `${ruta} trae un contacto`).toBe(false);
        }
      }
    }
  });

  test("las variantes 'completo' escritas a mano redirigen a la ruta base", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    for (const ruta of RUTAS) {
      const res = await page.request.get(`${ruta}/completo`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(new URL(res.headers().location, "http://x").pathname).toBe(ruta);
    }
  });

  // VGRP-78 — la tarjeta cobra desde ahí, sin pasar por /comprar. El usuario
  // del seed no tiene teléfono: el servidor lo pide antes de crear la
  // preferencia, así que el campo aparece en la tarjeta y no se sale de la
  // página. No se carga ningún teléfono: el test no escribe en la base.
  test("Comprar acceso en la tarjeta pide el teléfono ahí mismo, sin ir a /comprar", async ({
    page,
  }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    await expect(page.getByLabel("Teléfono de contacto")).toHaveCount(0);
    await page.getByRole("button", { name: "Comprar acceso" }).click();

    await expect(page.getByLabel("Teléfono de contacto")).toBeVisible();
    await expect(page.getByText("Ingresá un teléfono de contacto.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Comprar acceso" })).toBeDisabled();
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  });

  test("las APIs de la calculadora siguen en 403", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    const res = await page.request.post("/api/cotizador/dolar", { data: {} });
    expect(res.status()).toBe(403);
  });
});

test.describe("con plan, todo igual que antes (VGRP-77)", () => {
  test("Inicio, Calculadora y Formación sin blur ni tarjeta", async ({ page }) => {
    await login(page, COMPLETO.email, COMPLETO.password);

    for (const ruta of RUTAS) {
      await page.goto(ruta);
      await expect(page.locator("[inert]")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toHaveCount(0);
    }
  });

  // Ancla del test anti-fuga: si hay videos publicados, con plan el embed SÍ
  // viaja. Sin esto, un regex roto (o un cambio de proveedor) dejaría el test
  // de arriba en verde sin probar nada. VGRP-88: los videos de formación viven en
  // /formacion (Inicio solo muestra el resumen por stage, sin embeds).
  test("con videos de formación publicados, el HTML de /formacion trae los embeds", async ({
    page,
  }) => {
    const { count, error } = await createTestAdminClient()
      .from("videos")
      .select("id", { count: "exact", head: true })
      .in("stage", [1, 2])
      .eq("publicado", true)
      .not("provider_ref", "is", null);
    if (error) throw error;
    test.skip(!count, "no hay videos de formación publicados en la base");

    await login(page, COMPLETO.email, COMPLETO.password);
    const [html] = await cuerposCrudos(page, "/formacion");
    expect(html).toMatch(EMBED);
  });
});
