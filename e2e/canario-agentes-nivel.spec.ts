import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { sembrarAgenteViaAdmin } from "../test/helpers/admin-content-seed";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-50 — cierre del Bloque 7: el "canario" de fuga de datos entre niveles.
//
// Siembra un agente real de nivel 'avanzado' con un contacto único
// (CANARIO-<uuid>), navega Inicio como 'principiante' y confirma que ese contacto
// no aparece en NINGÚN lado observable por ese usuario: ni en el HTML servido, ni
// en el CUERPO de ninguna respuesta de red de la navegación — /api/agentes
// incluido. AgentesGrid es Client Component (VGRP-30): el contacto llega por
// fetch DESPUÉS de hidratar, así que no alcanza con mirar el HTML del CDN — hay
// que acumular cuerpos de respuesta de verdad con page.on("response").
//
// También recorre como 'avanzado': la ausencia sola no prueba que el mecanismo
// funciona (podría estar simplemente roto y no mostrar nada a nadie) — hace falta
// confirmar la presencia real cuando el nivel sí alcanza (US-3 de
// requirements-vgrp30.md).
// =============================================================================

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

// VGRP-55 punto 1 — sembrado vía la API real de admin (no un insert directo):
// lib/data/agentes.ts ahora cachea la lectura de filas (unstable_cache + tag)
// y sólo se invalidan cuando el Route Handler llama a revalidateTag() en una
// escritura real. Un insert directo a la tabla no dispara eso — el próximo
// GET /api/agentes podía seguir sirviendo la lista vieja desde caché. Ver
// test/helpers/admin-content-seed.ts.
async function sembrarAgenteCanario(browser: import("@playwright/test").Browser, contacto: string) {
  const agente = await sembrarAgenteViaAdmin(browser, {
    nombre: `Agente canario VGRP-50 ${randomUUID()}`,
    especialidad: "Test de fuga de datos entre niveles",
    nivel_requerido: "avanzado",
    contacto,
  });
  return agente.id;
}

test.describe("canario de fuga entre niveles — agente 'avanzado' (VGRP-30/50)", () => {
  test("un usuario 'principiante' nunca ve el contacto del canario — ni en el HTML, ni en el cuerpo de ninguna respuesta de red de la navegación", async ({
    page,
    browser,
  }) => {
    const contacto = `CANARIO-${randomUUID()}`;
    const agenteId = await sembrarAgenteCanario(browser, contacto);
    const created = await createAuthenticatedUser("principiante");

    const cuerpos: Promise<string>[] = [];
    page.on("response", (res) => {
      cuerpos.push(res.text().catch(() => ""));
    });

    try {
      await loginComo(page, created.email);

      // /api/agentes es un fetch de cliente que dispara AgentesGrid después de
      // hidratar (VGRP-30) — esperarlo explícito en vez de confiar en el timing
      // de networkidle, que puede resolver antes de que el componente termine de
      // pedirlo.
      const respuestaAgentes = await page.waitForResponse((res) =>
        res.url().includes("/api/agentes"),
      );
      expect(respuestaAgentes.ok()).toBe(true);
      await page.waitForLoadState("networkidle");

      // Ancla: el nombre (público, siempre visible) SÍ tiene que aparecer — si no
      // aparece, la grilla no cargó de verdad y el resto del test no prueba nada.
      await expect(page.getByText("Agente canario VGRP-50")).toBeVisible();

      const html = await page.content();
      expect(html).not.toContain(contacto);

      const cuerposResueltos = await Promise.all(cuerpos);
      const fugoEnRed = cuerposResueltos.some((c) => c.includes(contacto));
      expect(
        fugoEnRed,
        "El contacto del agente canario apareció en el cuerpo de alguna respuesta de red " +
          "durante la navegación de un usuario 'principiante'.",
      ).toBe(false);
    } finally {
      await admin.from("agentes").delete().eq("id", agenteId);
      await cleanupUser(created.userId);
    }
  });

  test("el mismo recorrido como 'avanzado': el contacto del canario SÍ aparece", async ({
    page,
    browser,
  }) => {
    const contacto = `CANARIO-${randomUUID()}`;
    const agenteId = await sembrarAgenteCanario(browser, contacto);
    const created = await createAuthenticatedUser("avanzado");

    try {
      await loginComo(page, created.email);
      await page.waitForResponse((res) => res.url().includes("/api/agentes"));

      await expect(page.getByText("Agente canario VGRP-50")).toBeVisible();
      await expect(page.getByText(contacto)).toBeVisible();
    } finally {
      await admin.from("agentes").delete().eq("id", agenteId);
      await cleanupUser(created.userId);
    }
  });
});
