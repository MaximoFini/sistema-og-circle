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
// LÍMITE DE ENTORNO documentado (no arreglable desde este ticket, mismo
// criterio que ya documentan VGRP-45/48 en docs/TESTING.md): la rama
// `nivelActual === 'ninguno'` de ContenidoBloqueado (CTA "Comprar acceso")
// nunca se alcanza desde una pantalla real. `middleware.ts` sólo reescribe
// `/dashboard` -> `/dashboard/{principiante,avanzado}` (donde vive
// <AgentesGrid>) cuando el nivel es justamente uno de esos dos; un usuario
// `nivel='ninguno'` sigue viendo `app/(app)/dashboard/page.tsx` (VGRP-18),
// que no usa <ContenidoBloqueado> en absoluto. No se simula esta rama acá
// (sería justamente el tipo de test con RTL/render aislado que el ticket
// pide no agregar) — queda anotado como pregunta abierta en el reporte final.
// =============================================================================

const MARCADOR = "[test] e2e-gating";
const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

async function loginComo(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("ContenidoBloqueado en AgentesGrid — nunca oculta sin explicar (VGRP-49)", () => {
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

  test("bloqueado=true: el contacto NO está en el HTML (no oculto por CSS), muestra el nivel que desbloquea, y el CTA es 'Mejorar mi nivel' para un usuario con nivel propio", async ({
    page,
    browser,
  }) => {
    const sufijo = crypto.randomUUID();
    const nombreBloqueado = `${MARCADOR} bloqueado ${sufijo}`;
    const nombreDesbloqueado = `${MARCADOR} desbloqueado ${sufijo}`;
    const contactoSecreto = `contacto-secreto-e2e-${sufijo}`;

    // VGRP-55 punto 1 — sembrado vía la API real de admin (no un insert
    // directo): lib/data/agentes.ts cachea la lectura de filas y sólo se
    // invalida cuando el Route Handler llama a revalidateTag() en una
    // escritura real. Un insert directo podía dejar la grilla sirviendo la
    // lista vieja desde caché, sin este agente — ver
    // test/helpers/admin-content-seed.ts.
    const bloqueado = await sembrarAgenteViaAdmin(browser, {
      nombre: nombreBloqueado,
      especialidad: "Especialidad test",
      nivel_requerido: "avanzado",
      contacto: contactoSecreto,
    });
    agenteIds.push(bloqueado.id);

    const desbloqueado = await sembrarAgenteViaAdmin(browser, {
      nombre: nombreDesbloqueado,
      especialidad: "Especialidad test",
      nivel_requerido: "principiante",
      contacto: "contacto-visible-e2e",
    });
    agenteIds.push(desbloqueado.id);

    const creado = await createAuthenticatedUser("principiante");
    userId = creado.userId;
    await loginComo(page, creado.email);

    // publicMeta (nombre) SIEMPRE visible, esté bloqueado o no.
    await expect(page.getByText(nombreBloqueado)).toBeVisible();

    // El contacto real NUNCA está en el HTML — no es un chequeo de
    // visibilidad (que un `display:none` pasaría igual), es que el string ni
    // siquiera llegó al DOM ni al bundle servido.
    const html = await page.content();
    expect(html).not.toContain(contactoSecreto);

    // Localiza la card de este agente específico (evita pisarse con otras
    // filas reales que puedan existir en la tabla) y confirma, DENTRO de esa
    // card: el nivel que desbloquea, y el CTA correcto.
    const cardBloqueada = page.locator("div", { hasText: nombreBloqueado }).last();
    await expect(cardBloqueada.getByText("Avanzado")).toBeVisible();
    await expect(cardBloqueada.getByRole("link", { name: "Mejorar mi nivel" })).toBeVisible();
    await expect(cardBloqueada.getByRole("link", { name: "Comprar acceso" })).toHaveCount(0);

    // Control: bloqueado=false -> el contacto SÍ está, tal cual (children sin
    // envolver).
    const cardDesbloqueada = page.locator("div", { hasText: nombreDesbloqueado }).last();
    await expect(cardDesbloqueada.getByText("contacto-visible-e2e")).toBeVisible();
    await expect(cardDesbloqueada.getByRole("link", { name: "Mejorar mi nivel" })).toHaveCount(0);
  });
});
