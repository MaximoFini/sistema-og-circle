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
const RUTAS = ["/dashboard", "/calculadora"] as const;

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
  test("Inicio: tarjeta de desbloqueo con CTA a /comprar y el fondo inerte", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Comprar acceso" })).toHaveAttribute(
      "href",
      "/comprar",
    );

    // Qué incluye el plan, con Belo como partner de los pagos al exterior.
    const incluye = page.getByRole("list", { name: "Qué incluye" });
    await expect(incluye.getByRole("listitem")).toHaveCount(8);
    await expect(incluye.getByRole("img", { name: "Belo" })).toBeVisible();

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
    await page.goto("/calculadora");

    expect(new URL(page.url()).pathname).toBe("/calculadora");
    await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toBeVisible();
    await expect(page.locator("[inert]")).toHaveCount(1);
  });

  test("ni el HTML ni el payload RSC traen URLs de embed ni contactos", async ({ page }) => {
    const contactos = await contactosReales();
    await login(page, NINGUNO.email, NINGUNO.password);

    for (const ruta of RUTAS) {
      for (const cuerpo of await cuerposCrudos(page, ruta)) {
        expect(cuerpo, `${ruta} trae una URL de embed`).not.toMatch(EMBED);
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

  test("las APIs de la calculadora siguen en 403", async ({ page }) => {
    await login(page, NINGUNO.email, NINGUNO.password);

    const res = await page.request.post("/api/cotizador/dolar", { data: {} });
    expect(res.status()).toBe(403);
  });
});

test.describe("con plan, todo igual que antes (VGRP-77)", () => {
  test("Inicio y Calculadora sin blur ni tarjeta", async ({ page }) => {
    await login(page, COMPLETO.email, COMPLETO.password);

    for (const ruta of RUTAS) {
      await page.goto(ruta);
      await expect(page.locator("[inert]")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Desbloqueá OG Circle" })).toHaveCount(0);
    }
  });

  // Ancla del test anti-fuga: si hay videos publicados, con plan el embed SÍ
  // viaja. Sin esto, un regex roto (o un cambio de proveedor) dejaría el test
  // de arriba en verde sin probar nada.
  test("con videos publicados, el HTML de Inicio trae los embeds", async ({ page }) => {
    const { count, error } = await createTestAdminClient()
      .from("videos")
      .select("id", { count: "exact", head: true })
      .eq("publicado", true)
      .not("provider_ref", "is", null);
    if (error) throw error;
    test.skip(!count, "no hay videos publicados en la base");

    await login(page, COMPLETO.email, COMPLETO.password);
    const [html] = await cuerposCrudos(page, "/dashboard");
    expect(html).toMatch(EMBED);
  });
});
