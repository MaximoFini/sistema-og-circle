import { expect, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-45 §4 — flujo crítico: registro → login → dashboard con el nivel
// correcto (STACK.md §9).
//
// -----------------------------------------------------------------------------
// HALLAZGO EMPÍRICO — `/registro` no se puede completar de punta a punta en
// este entorno, y no es un supuesto: se verificó a mano antes de escribir
// este archivo.
// -----------------------------------------------------------------------------
// `app/(auth)/registro/page.tsx` gatea el formulario con
// `flags.registro_habilitado` (`lib/config::getFlags()`, Edge Config). En
// este entorno `EDGE_CONFIG` no está seteada en `.env.local` (confirmado:
// sólo trae `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
// `SUPABASE_SERVICE_ROLE_KEY` — ver `.env.example` y docs/EDGE-CONFIG.md,
// "Estado actual": nadie vinculó un store de Vercel todavía, VGRP-39).
//
// Se ejecutó a mano `await (await import("@vercel/edge-config")).get("flags")`
// contra este mismo `node_modules`, sin `EDGE_CONFIG` seteada: tira
// sincrónicamente `"@vercel/edge-config: No connection string provided"`.
// `lib/config/index.ts::readKey()` atrapa esa excepción y devuelve
// `undefined`; `configSchema.shape.flags.safeParse(undefined)` falla; y
// `getFlags()` cae al default fail-closed del módulo
// (`DEFAULT_FLAGS.registro_habilitado === false`).
//
// Esto no es sólo "falta configurar una env var": docs/EDGE-CONFIG.md,
// sección "Valores iniciales recomendados (PRD Fase 2 §1.1)", documenta que
// el valor recomendado para CARGAR en el store cuando exista también es
// `registro_habilitado: false` — la Fase 2 actual del proyecto tiene el
// registro apagado a propósito, no por un olvido de infraestructura.
//
// Consecuencia real: `/registro` no renderiza `<RegistroForm>` en absoluto
// (ver el `if (!flags.registro_habilitado)` temprano en `registro/page.tsx`)
// — muestra el card "El registro todavía no está habilitado". El primer test
// de abajo confirma esto con Playwright real, sin asumir nada. Y aunque se
// pudiera montar el form igual (editando el DOM a mano, por ejemplo), la
// Server Action `registrarse()` (`app/(auth)/_actions.ts`) corta en su
// primera línea (`if (!flags.registro_habilitado) return { error: ... }`)
// antes de tocar Zod o Supabase — no hay ningún camino de UI real que
// termine creando la cuenta hoy.
//
// Por la regla no negociable de este archivo ("interacción real de
// Playwright para todo lo que un usuario real haría, nunca Server Actions
// salteando la UI"), no hay forma honesta de ejercitar "completar /registro
// y terminar logueado" de punta a punta acá — se documenta como
// `test.skip()`, mismo criterio que este ticket aplica en
// `e2e/recuperar-password.spec.ts` para el link de recuperación.
//
// Lo que SÍ se prueba de punta a punta con UI real, y es el corazón real de
// los puntos 3-5 del ticket: un usuario en el estado exacto que un registro
// exitoso dejaría (`nivel='ninguno'`, recién creado) inicia sesión desde
// `/login` con Playwright real y ve el dashboard bloqueado con el CTA
// correcto — dos veces, una sesión nueva y otra tras limpiar cookies para
// simular un logout (no hay flujo de logout en la UI todavía, ver el punto 4
// del ticket).
// =============================================================================

test.describe("registro → login → dashboard", () => {
  test("hoy /registro no ofrece el formulario real: el registro está deshabilitado (flags.registro_habilitado=false)", async ({
    page,
  }) => {
    const response = await page.goto("/registro");
    expect(response?.ok()).toBe(true);

    await expect(page.getByText("El registro todavía no está habilitado.")).toBeVisible();
    // El form real (RegistroForm) no está montado en absoluto en este estado.
    await expect(page.getByLabel("Nombre")).toHaveCount(0);
  });

  test("un usuario nuevo se registra desde /registro y termina logueado en el dashboard bloqueado", async () => {
    test.skip(
      true,
      "flags.registro_habilitado resuelve false en este entorno (EDGE_CONFIG no configurada " +
        "— ver el comentario grande al inicio de este archivo, con la verificación empírica). " +
        "/registro no renderiza el formulario real, así que no hay forma honesta de completarlo " +
        "con Playwright sin saltear la UI. Cuando exista un store de Edge Config con " +
        "registro_habilitado=true (o el equipo decida habilitarlo para este entorno de test), " +
        "reemplazar este skip por el flujo real: generar un email nuevo con randomUUID() bajo " +
        "el dominio @test.og-circle.invalid, ir a /registro, llenar " +
        "nombre/email/telefono/password con page.fill/page.getByLabel, click en 'Crear cuenta', " +
        "esperar page.waitForURL('**/dashboard'), confirmar el CTA 'Comprar acceso', y limpiar " +
        "con cleanupUser() al final.",
    );
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
      const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

      // --- Primera sesión: login real por /login ---------------------------
      await page.goto("/login");
      await page.getByLabel("Email").fill(created.email);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();

      await page.waitForURL("**/dashboard");
      await expect(page.getByText("Todavía no tenés acceso a ningún nivel")).toBeVisible();
      await expect(page.getByText("Comprá un nivel para desbloquear el contenido")).toBeVisible();
      await expect(page.getByRole("button", { name: "Comprar acceso" })).toBeVisible();
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
      await expect(page.getByText("Todavía no tenés acceso a ningún nivel")).toBeVisible();
      await expect(page.getByRole("button", { name: "Comprar acceso" })).toBeVisible();
    });
  });
});
