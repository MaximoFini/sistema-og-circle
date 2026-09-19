import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sembrarServicioViaAdmin } from "../test/helpers/admin-content-seed";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-52 — EL CANARIO SWIFT: la garantía más importante del ticket. Un servicio
// financiero nivel_requerido='avanzado' con datos SWIFT en `descripcion` nunca debe
// llegar, ni al HTML ni al cuerpo de NINGUNA respuesta de red, a un usuario que no
// pagó ese nivel. El TÍTULO sí tiene que verse siempre (PRD §6: una fila bloqueada
// nunca desaparece sin explicación) — sólo la `descripcion` (donde vive el dato SWIFT,
// ver lib/data/servicios.ts) es lo que se gatea.
//
// `page.on("response")` acumula el cuerpo de CADA respuesta (documento HTML, fetch de
// /api/servicios-financieros, todo) durante el recorrido — mirar sólo el DOM final no
// alcanza: si el canario viajara en la respuesta de red y el cliente simplemente no lo
// pintara, un chequeo de sólo-DOM no lo vería. Server Component (ContenidoBloqueado) +
// Route Handler dinámico son cosas separadas; este test cubre las dos capas a la vez.
//
// No hay helper de canario compartido en este worktree (rama aislada de los tickets
// hermanos del mismo bloque, VGRP-50 entre ellos) — se escribe acá mismo; si otro
// ticket trae uno equivalente, se deduplica en el merge de integración.
// =============================================================================

const admin = createTestAdminClient();

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("test-password-1!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

// VGRP-55 punto 1 — sembrado vía la API real de admin (no un insert directo):
// lib/data/servicios.ts ahora cachea la lectura de filas (unstable_cache +
// tag), que sólo se invalida cuando el Route Handler llama a revalidateTag()
// en una escritura real. Ver test/helpers/admin-content-seed.ts.
async function crearServicioCanario(
  browser: import("@playwright/test").Browser,
  titulo: string,
  descripcion: string,
): Promise<string> {
  const servicio = await sembrarServicioViaAdmin(browser, {
    titulo,
    descripcion,
    nivel_requerido: "avanzado",
  });
  return servicio.id;
}

test.describe("canario SWIFT — VGRP-52", () => {
  const canario = `SWIFT-CANARIO-${randomUUID()}`;
  const titulo = `Pagos vía SWIFT (canario ${randomUUID()})`;
  let servicioId: string;
  let principiante: Awaited<ReturnType<typeof createAuthenticatedUser>>;
  let avanzado: Awaited<ReturnType<typeof createAuthenticatedUser>>;

  test.beforeAll(async ({ browser }) => {
    servicioId = await crearServicioCanario(browser, titulo, canario);
    principiante = await createAuthenticatedUser("principiante");
    avanzado = await createAuthenticatedUser("avanzado");
  });

  test.afterAll(async () => {
    // La fila sembrada para el canario se limpia siempre, gane o pierda el test de
    // arriba — ninguna otra corrida debe encontrarla.
    await admin.from("servicios_financieros").delete().eq("id", servicioId);
    await cleanupUser(principiante.userId);
    await cleanupUser(avanzado.userId);
  });

  test("'principiante': el dato SWIFT NO aparece ni en el HTML ni en ninguna respuesta de red; el título y el CTA correcto sí", async ({
    page,
  }) => {
    const cuerpos: Promise<string>[] = [];
    page.on("response", (response) => {
      cuerpos.push(response.text().catch(() => ""));
    });

    await loginComo(page, principiante.email);
    await expect(page.getByText(titulo)).toBeVisible();
    await page.waitForLoadState("networkidle");

    const html = await page.content();
    expect(html).not.toContain(canario);

    const bodies = await Promise.all(cuerpos);
    for (const body of bodies) {
      expect(body).not.toContain(canario);
    }

    // Regla dura PRD §6: la fila nunca desaparece entera — título visible + mensaje de
    // nivel + CTA correcto para un nivelActual != 'ninguno' ("Mejorar mi nivel", no
    // "Comprar acceso").
    const card = page.getByText(titulo).locator("..");
    await expect(card.getByText("Disponible desde nivel", { exact: false })).toBeVisible();
    await expect(card.getByRole("link", { name: "Mejorar mi nivel" })).toBeVisible();
  });

  test("'avanzado': el dato SWIFT SÍ aparece", async ({ page }) => {
    await loginComo(page, avanzado.email);
    await expect(page.getByText(titulo)).toBeVisible();
    await expect(page.getByText(canario)).toBeVisible();
  });
});

test.describe("ProfesionalesGrid / ServiciosFinancierosGrid — estados de carga y vacío (VGRP-52)", () => {
  test("ambas grillas muestran 'Cargando…' antes de resolver el fetch, y 'Todavía no hay… cargados.' si la tabla vuelve vacía", async ({
    page,
  }) => {
    const usuario = await createAuthenticatedUser("avanzado");
    try {
      let liberarServicios: () => void = () => {};
      let liberarProfesionales: () => void = () => {};
      const frenoServicios = new Promise<void>((resolve) => {
        liberarServicios = resolve;
      });
      const frenoProfesionales = new Promise<void>((resolve) => {
        liberarProfesionales = resolve;
      });

      // Frenamos las dos respuestas para poder observar el estado "Cargando…" antes de
      // que resuelvan, y las hacemos volver vacías para observar el estado vacío
      // después — sin tocar la tabla real (compartida con el resto del equipo).
      await page.route("**/api/servicios-financieros", async (route) => {
        await frenoServicios;
        await route.fulfill({ json: { servicios: [], nivelActual: "avanzado" } });
      });
      await page.route("**/api/profesionales", async (route) => {
        await frenoProfesionales;
        await route.fulfill({ json: { profesionales: [] } });
      });

      await loginComo(page, usuario.email);

      await expect(page.getByText("Cargando servicios…")).toBeVisible();
      await expect(page.getByText("Cargando profesionales…")).toBeVisible();

      liberarServicios();
      liberarProfesionales();

      await expect(page.getByText("Todavía no hay servicios cargados.")).toBeVisible();
      await expect(page.getByText("Todavía no hay profesionales cargados.")).toBeVisible();
      await expect(page.getByText("Cargando servicios…")).toHaveCount(0);
      await expect(page.getByText("Cargando profesionales…")).toHaveCount(0);
    } finally {
      await cleanupUser(usuario.userId);
    }
  });
});
