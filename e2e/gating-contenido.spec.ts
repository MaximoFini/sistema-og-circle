import { expect, test } from "@playwright/test";
import { sembrarAgenteViaAdmin } from "../test/helpers/admin-content-seed";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-49 (PARTE A, punto 4) — <ContenidoBloqueado> nunca oculta sin explicar
// (PRD §6), probado contra la pantalla real (AgentesGrid en
// /dashboard/[variante], VGRP-30/38). No hay React Testing Library en este
// repo (sólo Vitest + Playwright) — el ticket pide explícitamente NO
// agregarla (sería una decisión de STACK.md §10, fuera de alcance) y probar
// esto en Playwright en su lugar.
//
// VGRP-59/60 (Bloque 13 — plan único): el gating por FILA (nivel_requerido
// por agente) desapareció junto con la columna (ver supabase/migrations/
// 20261002190000_plan_unico.sql, paso 5) — con un solo plan, un usuario con
// el plan completo ve TODAS las filas con contacto resuelto; RLS directamente
// no devuelve ninguna fila a un usuario 'ninguno' (gating todo-o-nada, no por
// fila). El escenario "misma pantalla, algunas filas bloqueadas y otras no
// para el mismo usuario" que este archivo probaba ya no es alcanzable — se
// reemplaza por confirmar que un usuario con el plan completo ve el contacto
// real de un agente sembrado.
//
// La rama `nivelActual === 'ninguno'` de ContenidoBloqueado (CTA "Comprar
// acceso") sigue sin ser alcanzable desde una pantalla real por el mismo
// motivo documentado antes de este cambio: `middleware.ts` sólo reescribe
// `/dashboard` -> `/dashboard/completo` cuando el nivel es 'completo'; un
// usuario `nivel='ninguno'` ve el Inicio borroso (VGRP-77), detrás de una
// tarjeta de desbloqueo e inerte: no se puede interactuar con sus candados.
// =============================================================================

const MARCADOR = "[test] e2e-gating";
const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("AgentesGrid con el plan completo — contenido nunca queda oculto sin explicar (VGRP-49/59)", () => {
  let userId: string | null = null;
  const agenteIds: string[] = [];
  const admin = createTestAdminClient();

  test.afterEach(async () => {
    for (const id of agenteIds.splice(0)) {
      await admin.from("agentes").delete().eq("id", id);
    }
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  test("un usuario con el plan completo ve el contacto real del agente, sin ningún candado", async ({
    page,
    browser,
  }) => {
    const sufijo = crypto.randomUUID();
    const nombre = `${MARCADOR} ${sufijo}`;
    const contacto = `contacto-visible-e2e-${sufijo}`;

    // VGRP-55 punto 1 — sembrado vía la API real de admin (no un insert
    // directo): lib/data/agentes.ts cachea la lectura de filas y sólo se
    // invalida cuando el Route Handler llama a revalidateTag() en una
    // escritura real. Un insert directo podía dejar la grilla sirviendo la
    // lista vieja desde caché, sin este agente — ver
    // test/helpers/admin-content-seed.ts.
    const agente = await sembrarAgenteViaAdmin(browser, {
      nombre,
      especialidad: "Especialidad test",
      contacto,
    });
    agenteIds.push(agente.id);

    const creado = await createAuthenticatedUser("completo");
    userId = creado.userId;
    await loginComo(page, creado.email);

    // publicMeta (nombre) siempre visible.
    await expect(page.getByText(nombre)).toBeVisible();

    // Con el plan completo, el contacto real está en el DOM — no hay candado
    // ni CTA de compra/mejora de nivel para este agente.
    const card = page.locator("div", { hasText: nombre }).last();
    await expect(card.getByText(contacto)).toBeVisible();
    await expect(card.getByRole("link", { name: "Comprar acceso" })).toHaveCount(0);
  });
});
