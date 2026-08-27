// VGRP-45 — obtener el link de recuperación de contraseña en E2E sin que
// salga ningún email, real o de prueba.
//
// Por qué esto reemplaza a "interceptar Resend" en vez de mockearlo: hoy el
// Send Email Hook de Supabase (que es lo único que llama a Resend, ver
// docs/EMAIL.md) NO ESTÁ REGISTRADO A PROPÓSITO — mientras no exista un
// dominio con SPF/DKIM verificados, registrarlo rompe el reset de contraseña
// para usuarios reales. O sea: hoy, `resetPasswordForEmail()` dispara el
// email POR DEFECTO de Supabase, no pasa por Resend ni por nuestro webhook en
// absoluto. Un mock de Resend no interceptaría nada en ese camino.
//
// Armar un mock que además cubra "cuando el hook esté activo" sería
// complejidad que no se puede probar hoy (no hay forma de activar el hook en
// un E2E sin dominio real) y que ya está cubierta donde corresponde: los
// mocks de Resend con `vi.mock` en `lib/email/send.test.ts` y
// `app/api/auth/send-email/route.test.ts` (VGRP-43/25) prueban ese código a
// nivel unitario. El E2E de VGRP-45 prueba el flujo de la APP (pedir reset →
// abrir el link → cargar contraseña nueva → quedar logueado), no la entrega
// de Resend — para eso no hace falta que salga ningún email en absoluto.
//
// La solución es el Admin API de Supabase: `generateLink({ type: "recovery" })`
// devuelve el mismo link que un email de recuperación traería, sin mandar
// nada — está pensado por Supabase exactamente para este caso (tests,
// backends que arman su propio flujo de email). Nunca usar esto fuera de
// tests: en la app real, el flujo sigue siendo
// `supabase.auth.resetPasswordForEmail()` + el email que corresponda.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { withAuthRetry } from "./with-auth-retry";

export interface RecoveryLink {
  /** URL completa lista para que Playwright navegue directo, como si fuera
   *  el link de un email real (`.../auth/v1/verify?token=...&type=recovery&redirect_to=...`). */
  actionLink: string;
  /** `token_hash` suelto, por si algún test necesita armar la URL a mano en
   *  vez de usar `actionLink` tal cual (ver `construirUrlDeConfirmacion` en
   *  `app/api/auth/send-email/route.tsx`, que arma el mismo tipo de URL). */
  tokenHash: string;
}

/**
 * Genera el link de recuperación de contraseña para `email` sin mandar
 * ningún email. Requiere el cliente admin (`createTestAdminClient()`): el
 * Admin API de Supabase sólo funciona con la service role key.
 */
export async function generateRecoveryLink(
  admin: SupabaseClient<Database>,
  email: string,
  redirectTo: string,
): Promise<RecoveryLink> {
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } }),
  );
  if (error) {
    throw new Error(`generateLink("recovery") falló para ${email}: ${error.message}`);
  }

  const { action_link: actionLink, hashed_token: tokenHash } = data.properties;
  if (!actionLink || !tokenHash) {
    throw new Error(
      `generateLink("recovery") para ${email} no devolvió action_link/hashed_token — ` +
        `respuesta inesperada de Supabase: ${JSON.stringify(data.properties)}`,
    );
  }

  return { actionLink, tokenHash };
}
