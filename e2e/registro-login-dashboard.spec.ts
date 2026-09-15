import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAuthenticatedUser, DEFAULT_TEST_PASSWORD } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";
import { TEST_EMAIL_SUFFIX } from "../test/helpers/seed-users";
import { withAuthRetry } from "../test/helpers/with-auth-retry";

// =============================================================================
// VGRP-45 §4 / VGRP-42 — flujo crítico: registro → login → dashboard con el
// nivel correcto (STACK.md §9).
//
// -----------------------------------------------------------------------------
// `flags.registro_habilitado` está en `true` — confirmado, no es un default
// -----------------------------------------------------------------------------
// Este archivo asumía originalmente que `flags.registro_habilitado` resolvía
// `false` porque el store de Edge Config todavía no existía (VGRP-39, momento
// en que se escribió). Eso cambió: el store `sistema-og-circle` ya está
// vinculado con valores reales desde el commit `1d0423b` (2026-09-05,
// docs/EDGE-CONFIG.md) — `registro_habilitado: true` no es un valor
// recomendado ni tentativo, es lo que el store real tiene cargado hoy, y se
// reconfirmó en vivo (`get("flags")` contra el store real) al investigar
// VGRP-42. `/registro` monta `<RegistroForm>` de verdad, así que el primer
// test de abajo ejercita el flujo completo con Playwright real — nada de
// `test.skip()`.
//
// Lo que se prueba de punta a punta con UI real:
//   1. Un usuario nuevo completa `/registro` (nombre, email, teléfono,
//      password, checkbox de Términos) y `registrarse()` lo deja logueado
//      directo en `/dashboard` con el nivel `'ninguno'` que deja todo
//      registro real (sin pagos previos).
//   2. Ese mismo estado (`nivel='ninguno'`, recién creado) se vuelve a
//      alcanzar por login real desde `/login` — dos veces, una sesión nueva
//      y otra tras limpiar cookies para simular un logout (no hay flujo de
//      logout en la UI todavía, ver el punto 4 del ticket VGRP-45).
// =============================================================================

test.describe("registro → login → dashboard", () => {
  test("un usuario nuevo se registra desde /registro y termina logueado en el dashboard bloqueado", async ({
    page,
  }) => {
    const admin = createTestAdminClient();
    const email = `e2e-registro-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
    const PASSWORD = DEFAULT_TEST_PASSWORD;
    let userId: string | null = null;

    try {
      await page.goto("/registro");

      await page.getByLabel("Nombre").fill("Usuario E2E");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Teléfono").fill("+54 9 11 1234-5678");
      await page.getByLabel("Contraseña").fill(PASSWORD);
      // El label del checkbox incluye links inline (Términos/Privacidad), así
      // que `getByLabel` con el texto completo no matchea de forma
      // confiable — el rol accesible alcanza, es el único checkbox del form.
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Crear cuenta" }).click();

      await page.waitForURL("**/dashboard");
      // Mismo hallazgo de Bloque 9 que el resto de este archivo:
      // `getByRole("heading", ...)`, no `getByText`, por el route announcer
      // oculto de Next.js.
      await expect(
        page.getByRole("heading", { name: "Todavía no tenés acceso a ningún nivel" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Comprar acceso" })).toBeVisible();

      // `registrarse()` corre server-side y no expone el `userId` creado a
      // este proceso de Playwright (server hijo separado, ver el comentario
      // de límite de entorno en `e2e/pago-aprobado-acceso.spec.ts`) — se
      // busca por el email único recién usado, mismo patrón que ya usa
      // `test/integration/auth-actions.test.ts` ("housekeeping") para
      // ubicar usuarios ad hoc por su dominio de test.
      const { data, error } = await withAuthRetry(() => admin.auth.admin.listUsers({ perPage: 1000 }));
      if (error) throw error;
      const created = data.users.find((u) => u.email === email);
      if (!created) throw new Error("no se encontró el usuario recién registrado para limpiarlo");
      userId = created.id;
    } finally {
      if (userId) await cleanupUser(userId);
    }
  });

  test.describe("con un usuario recién creado (nivel='ninguno', el estado que deja un registro real)", () => {
    let userId: string | null = null;

    test.afterEach(async () => {
      // Limpieza explícita del spec, no depender sólo del global teardown
      // (que igual corre al final de toda la suite — ver
      // e2e/global-teardown.ts).
      if (userId) {
        await cleanupUser(userId);
        userId = null;
      }
    });

    test("login real desde /login y una segunda sesión tras limpiar cookies terminan en el mismo dashboard bloqueado", async ({
      page,
    }) => {
      // Arrange vía Node (no UI): createAuthenticatedUser() crea el usuario
      // con el Admin API, exactamente el estado (`nivel='ninguno'`) que un
      // registro real por /registro dejaría si estuviera habilitado. Esto no
      // reemplaza probar /registro (ver los dos tests de arriba) — es sólo
      // cómo se consigue un usuario real para poder probar login/dashboard,
      // que es independiente del flag de registro.
      const created = await createAuthenticatedUser("ninguno");
      userId = created.userId;
      const PASSWORD = DEFAULT_TEST_PASSWORD;

      // --- Primera sesión: login real por /login ---------------------------
      await page.goto("/login");
      await page.getByLabel("Email").fill(created.email);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();

      await page.waitForURL("**/dashboard");
      // `getByRole("heading", ...)`, no `getByText`: Next.js espeja el <h1> en un
      // `div[role=alert]` oculto (`__next-route-announcer__`, accesibilidad de
      // navegación) apenas se resuelve la ruta — `getByText` (sin scope de rol)
      // matchea ambos y viola modo estricto de forma intermitente, según si el
      // announcer ya se actualizó cuando corre el assert. Hallazgo de Bloque 9
      // corriendo la suite completa varias veces seguidas.
      await expect(
        page.getByRole("heading", { name: "Todavía no tenés acceso a ningún nivel" }),
      ).toBeVisible();
      await expect(page.getByText("Comprá un nivel para desbloquear el contenido")).toBeVisible();
      // El CTA es un `<NextLink>` (un `<a>`), no un `<button>` — su rol
      // accesible real es "link" (app/(app)/dashboard/page.tsx, VGRP-22:
      // reusa las clases de Button.module.css para el estilo, nunca el
      // elemento, para no anidar un <button> dentro del <a>). Hallazgo de
      // VGRP-48 corriendo esta suite contra un build real: este selector
      // nunca podía matchear.
      await expect(page.getByRole("link", { name: "Comprar acceso" })).toBeVisible();
      // Ningún error 500 ni contenido de otro nivel: el texto de otros
      // niveles ("Tenés acceso …") no debería estar en pantalla.
      await expect(page.getByText(/Tenés acceso/)).toHaveCount(0);

      // --- "Logout": no hay flujo de logout en la UI todavía (VGRP-45 punto
      // 4 lo permite explícitamente) — se limpian las cookies para simular
      // una sesión nueva, y se confirma que de verdad desloguea: /dashboard
      // sin sesión tiene que rebotar a /login (middleware.ts, VGRP-17). ---
      await page.context().clearCookies();
      await page.goto("/dashboard");
      await page.waitForURL(/\/login\?next=%2Fdashboard/);

      // --- Segunda sesión: login real de nuevo con las mismas credenciales -
      await page.getByLabel("Email").fill(created.email);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();

      await page.waitForURL("**/dashboard");
      await expect(
        page.getByRole("heading", { name: "Todavía no tenés acceso a ningún nivel" }),
      ).toBeVisible();
      // El CTA es un `<NextLink>` (un `<a>`), no un `<button>` — su rol
      // accesible real es "link" (app/(app)/dashboard/page.tsx, VGRP-22:
      // reusa las clases de Button.module.css para el estilo, nunca el
      // elemento, para no anidar un <button> dentro del <a>). Hallazgo de
      // VGRP-48 corriendo esta suite contra un build real: este selector
      // nunca podía matchear.
      await expect(page.getByRole("link", { name: "Comprar acceso" })).toBeVisible();
    });
  });
});
