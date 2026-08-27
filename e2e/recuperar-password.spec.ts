import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";
import { generateRecoveryLink } from "../test/helpers/recovery";
import { TEST_EMAIL_SUFFIX } from "../test/helpers/seed-users";
import { withAuthRetry } from "../test/helpers/with-auth-retry";

// =============================================================================
// VGRP-45 §4 — flujo de recuperación de contraseña.
//
// -----------------------------------------------------------------------------
// HALLAZGO EMPÍRICO — el link de `generateLink()` NO canjea con `?code=` en
// este proyecto, verificado a mano (no asumido) antes de escribir este
// archivo.
// -----------------------------------------------------------------------------
// `test/integration/auth-actions.test.ts` (VGRP-45 §1/§2) ya había anotado la
// sospecha: "generateLink()'s Admin API returns an implicit-flow link
// (#access_token= in the fragment) against this project, not the ?code= the
// app's /auth/callback route expects". A diferencia de ese test de
// integración (que no tiene browser real), acá SÍ hay uno — así que se pudo
// verificar la cadena completa de verdad.
//
// Se creó un usuario de test real, se generó su link con
// `generateRecoveryLink(admin, email, "http://localhost:3000/auth/callback")`
// y se siguió la cadena de redirects a mano (fetch con `redirect: "manual"`,
// sin auto-seguir, para poder inspeccionar cada hop):
//
//   actionLink real generado:
//   https://<PROJECT>.supabase.co/auth/v1/verify?token=<hashed_token>&type=recovery&redirect_to=http://localhost:3000/auth/callback
//
//   hop 0 → GET ese actionLink
//   status: 303
//   location: http://localhost:3000/auth/callback#access_token=<JWT>&expires_at=...&expires_in=3600&refresh_token=<refresh>&sb=&token_type=bearer&type=recovery
//
// O sea: Supabase resuelve el `token_hash` en SU PROPIO `/auth/v1/verify` y
// redirige derecho a `redirect_to` con los tokens en el FRAGMENTO de la URL
// (`#access_token=...`, flujo implícito) — nunca hay un `?code=` en ningún
// punto de la cadena. `app/auth/callback/route.ts` sólo lee
// `searchParams.get("code")` (el fragmento nunca llega al servidor — el
// browser no lo manda) y, al no encontrar `code` ni `error`/`error_code` en
// la query string (Supabase no puso ninguno: el token_hash SÍ era válido),
// cae al camino "inválido" (ver el comentario grande de ese archivo) y
// redirige a `/recuperar/nueva?error=invalido`.
//
// La alternativa que sugiere el ticket ("construir la URL de verify a mano
// con el tokenHash") ES exactamente esta misma URL —
// `generateRecoveryLink()` ya arma `action_link` con esa forma exacta (ver su
// propio comentario, y `construirUrlDeConfirmacion` en
// `app/api/auth/send-email/route.tsx`) — así que no hay una segunda forma
// distinta para probar: ambas caen en el mismo resultado.
//
// Conclusión: en este entorno, un link de recuperación real y válido no deja
// una sesión utilizable al llegar a nuestra app — es un problema de
// configuración del flow type de Supabase Auth del proyecto (implícito en
// vez de PKCE) o de que `/auth/callback` esperaría un `/auth/confirm` con
// `verifyOtp()` en su lugar (ver docs/EMAIL.md, sección "Deuda conocida"),
// ninguno de los dos en el alcance de este ticket. No se fuerza un test
// falso: el segundo test de abajo prueba HONESTAMENTE lo que de verdad pasa
// hoy (aterriza en el error, no en una sesión funcionando), y el tercero
// documenta como `test.skip()` la parte que no se puede ejercitar de punta a
// punta con este entorno tal cual está configurado.
// =============================================================================

test.describe("recuperación de contraseña", () => {
  test("pedir el reset desde /recuperar muestra el mensaje de confirmación en pantalla", async ({
    page,
  }) => {
    // No depende de que la cuenta exista (VGRP-19, anti-enumeración de
    // emails — RecuperarForm.tsx): no hace falta crear ningún usuario para
    // probar esto de punta a punta con UI real.
    const email = `recuperar-${randomUUID()}${TEST_EMAIL_SUFFIX}`;

    await page.goto("/recuperar");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Mandar link de recuperación" }).click();

    await expect(
      page.getByText(
        "Si el email está registrado, te mandamos un link para recuperar tu contraseña.",
      ),
    ).toBeVisible();
    // El form desaparece, reemplazado por la confirmación (ver RecuperarForm.tsx).
    await expect(page.getByLabel("Email")).toHaveCount(0);
  });

  test("el link de recuperación real (Admin API) no canjea con sesión: navega y confirma el error honesto de hoy", async ({
    page,
    baseURL,
  }) => {
    // Arrange vía Node (no UI): un usuario real de test y su link real,
    // igual que documenta test/helpers/recovery.ts — sólo para simular el
    // link que traería el email, sin mandar ninguno.
    const admin = createTestAdminClient();
    const email = `recuperar-link-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
    const { data: created, error: createError } = await withAuthRetry(() =>
      admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
    );
    if (createError) throw createError;

    try {
      const link = await generateRecoveryLink(admin, email, `${baseURL}/auth/callback`);

      // Navegación real de Playwright, como si el usuario hubiera clickeado
      // el link del mail real.
      await page.goto(link.actionLink);

      // Ver el comentario grande al inicio del archivo: esto es lo que
      // realmente pasa hoy, no lo que "debería" pasar.
      await page.waitForURL(/\/recuperar\/nueva\?error=invalido/);
      await expect(
        page.getByText("Este link no es válido. Pedí uno nuevo para recuperar tu contraseña."),
      ).toBeVisible();
    } finally {
      await withAuthRetry(() => admin.auth.admin.deleteUser(created.user.id));
    }
  });

  test("clickear el link real y definir una contraseña nueva, de punta a punta (login incluido)", async () => {
    test.skip(
      true,
      "El link que genera el Admin API de Supabase para este proyecto resuelve en flujo " +
        "implícito (tokens en el fragmento `#access_token=...`), nunca en `?code=` — " +
        "confirmado navegando el actionLink real con Playwright en el test de arriba (ver " +
        "también el comentario grande al inicio de este archivo con la cadena de redirects " +
        "real). `/auth/callback` sólo puede leer `code` de la query string (el fragmento nunca " +
        "llega al servidor), así que este link real, aunque válido, no deja una sesión " +
        "funcionando: termina en /recuperar/nueva?error=invalido en vez de en el formulario de " +
        "contraseña nueva. No hay forma honesta de completar 'definir contraseña nueva' de " +
        "punta a punta con Playwright en este entorno sin cambiar el flow type de Supabase " +
        "Auth del proyecto o migrar a una ruta /auth/confirm + verifyOtp() (ver docs/EMAIL.md, " +
        "'Deuda conocida') — ambos fuera del alcance de este ticket.",
    );
  });
});
