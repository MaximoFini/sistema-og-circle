// =============================================================================
// VGRP-26 — verificación de links de Supabase Auth enviados por nuestro hook
// de email (`app/api/auth/send-email/route.tsx`).
//
// El link llega como `<site>/auth/confirm?token_hash=...&type=...&next=...`.
// Acá se canjea el `token_hash` con `verifyOtp()` (no pasa por el endpoint de
// Supabase, así que el destino lo controlamos nosotros) y se redirige a `next`.
//
// `next` es input no confiable: sólo se acepta un path relativo a nuestro
// origen (`safeRedirectPath`). Cualquier otra cosa cae al default.
// Público por `PUBLIC_PREFIXES` en middleware.ts: quien clickea el link todavía
// no tiene sesión.
// =============================================================================

import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/auth/server";

const TIPOS_VALIDOS: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function esTipoValido(valor: string | null): valor is EmailOtpType {
  return valor !== null && (TIPOS_VALIDOS as readonly string[]).includes(valor);
}

/** Destino por defecto según el tipo: recuperación va a la pantalla de nueva contraseña. */
function destinoPorDefecto(tipo: EmailOtpType): string {
  return tipo === "recovery" ? "/recuperar/nueva" : "/dashboard";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const tipoCrudo = searchParams.get("type");

  if (!tokenHash || !esTipoValido(tipoCrudo)) {
    const destino = new URL("/recuperar", origin);
    destino.searchParams.set("error", "enlace-invalido");
    return NextResponse.redirect(destino);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: tipoCrudo, token_hash: tokenHash });

  if (error) {
    const destino = new URL("/recuperar", origin);
    destino.searchParams.set("error", "enlace-vencido");
    return NextResponse.redirect(destino);
  }

  const next = safeRedirectPath(searchParams.get("next"), destinoPorDefecto(tipoCrudo));
  return NextResponse.redirect(new URL(next, origin));
}
