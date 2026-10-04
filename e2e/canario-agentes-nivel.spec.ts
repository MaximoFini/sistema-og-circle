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
// VGRP-59/60 (Bloque 13 — plan único): el gating pasó de ser por FILA
// (nivel_requerido por agente) a ser todo-o-nada por usuario — un usuario
// 'ninguno' no ve NINGUNA fila de `agentes` (RLS las filtra directamente, ver
// supabase/migrations/20261002190000_plan_unico.sql, policy
// "agentes_select_con_acceso"), y un usuario 'completo' las ve todas. Este
// canario sigue probando lo mismo que antes (que el contacto de un agente
// jamás llega a un usuario sin acceso, ni en el HTML ni en el cuerpo de
// ninguna respuesta de red), sólo que ahora la variable es el nivel del
// usuario ('ninguno' vs 'completo'), no un "nivel_requerido" por fila.
//
// AgentesGrid es Client Component (VGRP-30): el contacto llega por fetch
// DESPUÉS de hidratar, así que no alcanza con mirar el HTML del CDN — hay que
// acumular cuerpos de respuesta de verdad con page.on("response").
//
// También recorre como 'completo': la ausencia sola no prueba que el
// mecanismo funciona (podría estar simplemente roto y no mostrar nada a
// nadie) — hace falta confirmar la presencia real cuando el nivel sí alcanza
// (US-3 de requirements-vgrp30.md).
// =============================================================================

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

// VGRP-55 punto 1 — sembrado vía la API real de admin (no un insert directo):
// lib/data/agentes.ts cachea la lectura de filas (unstable_cache + tag) y
// sólo se invalida cuando alguien llama a revalidateTag() en una escritura
// real. Un insert directo a la tabla no dispara eso — el próximo
// GET /api/agentes podía seguir sirviendo la lista vieja desde caché. Ver
// test/helpers/admin-content-seed.ts.
async function sembrarAgenteCanario(browser: import("@playwright/test").Browser, contacto: string) {
  const agente = await sembrarAgenteViaAdmin(browser, {
    nombre: `Agente canario VGRP-50 ${randomUUID()}`,
    especialidad: "Test de fuga de datos entre niveles",
    contacto,
  });
  return agente.id;
}

test.describe("canario de fuga entre niveles — plan único (VGRP-30/50/59)", () => {
  test("un usuario 'ninguno' nunca ve el contacto del canario — ni en el HTML, ni en el cuerpo de ninguna respuesta de red de la navegación", async ({
    page,
    browser,
  }) => {
    const contacto = `CANARIO-${randomUUID()}`;
    const agenteId = await sembrarAgenteCanario(browser, contacto);
    const created = await createAuthenticatedUser("ninguno");

    const cuerpos: Promise<string>[] = [];
    page.on("response", (res) => {
      cuerpos.push(res.text().catch(() => ""));
    });

    try {
      await loginComo(page, created.email);

      // Un usuario 'ninguno' cae en app/(app)/dashboard/page.tsx (VGRP-18),
      // que no monta <AgentesGrid> — por eso acá no se espera la respuesta de
      // /api/agentes como ancla (ese fetch nunca sale). El ancla de que la
      // navegación terminó es el propio estado "ninguno" del dashboard.
      await expect(page.getByText("Todavía no tenés acceso a ningún nivel")).toBeVisible();
      await page.waitForLoadState("networkidle");

      const html = await page.content();
      expect(html).not.toContain(contacto);

      const cuerposResueltos = await Promise.all(cuerpos);
      const fugoEnRed = cuerposResueltos.some((c) => c.includes(contacto));
      expect(
        fugoEnRed,
        "El contacto del agente canario apareció en el cuerpo de alguna respuesta de red " +
          "durante la navegación de un usuario sin el plan completo.",
      ).toBe(false);
    } finally {
      await admin.from("agentes").delete().eq("id", agenteId);
      await cleanupUser(created.userId);
    }
  });

  test("el mismo recorrido con el plan completo: el contacto del canario SÍ aparece", async ({
    page,
    browser,
  }) => {
    const contacto = `CANARIO-${randomUUID()}`;
    const agenteId = await sembrarAgenteCanario(browser, contacto);
    const created = await createAuthenticatedUser("completo");

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
