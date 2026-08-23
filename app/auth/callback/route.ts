// =============================================================================
// VGRP-19 — canje del `code` de recuperación de contraseña por una sesión.
//
// Route Handler, no Server Component: es el destino del link que Supabase
// manda por email (`resetPasswordForEmail({ redirectTo: "<origin>/auth/callback" })`,
// ver `../../(auth)/_actions.ts`). Quien clickea ese link NO tiene sesión
// todavía — es justo lo que viene a recuperar — así que esta ruta tiene que
// ser alcanzable sin cookie de sesión: ya está en `PUBLIC_PREFIXES` de
// `middleware.ts` (VGRP-17 la dejó pre-cargada para este ticket).
//
// Vive fuera de `app/(auth)/` a propósito: es una API route, no una pantalla
// con el layout de `(auth)` — no tiene HTML propio, sólo hace un canje y
// redirige.
//
// -----------------------------------------------------------------------------
// LOS TRES ESTADOS DEL LINK (punto 3 del ticket)
// -----------------------------------------------------------------------------
// El link real que manda Supabase apunta primero a su propio
// `<SUPABASE_URL>/auth/v1/verify?token_hash=...&type=recovery&redirect_to=<acá>`
// (ver docs/EMAIL.md, sección "Deuda conocida"). Ese endpoint de Supabase
// verifica el `token_hash` ANTES de que este Route Handler vea nada:
//
// - Si el `token_hash` es válido, Supabase redirige acá con `?code=...`
//   (un code de un solo uso, recién emitido) — sigue el camino feliz de
//   abajo.
// - Si el `token_hash` NO es válido (vencido, o el link ya se clickeó una
//   vez y Supabase ya lo invalidó), Supabase redirige acá con
//   `?error=...&error_code=...&error_description=...` en vez de `code`.
//
//   Acá es donde la distinción "vencido" vs "usado" se vuelve indistinguible
//   del lado del código: Supabase manda el MISMO `error_code=otp_expired`
//   tanto para un link realmente vencido por tiempo como para un link que ya
//   se clickeó antes (el primer click ya consumió el `token_hash`, así que
//   un segundo click lo encuentra "no más válido" por la misma razón que uno
//   vencido). No hay forma honesta de separar esos dos casos con la
//   información que da Supabase acá — se agrupan bajo "vencido".
//
// - Si no hay ni `code` ni ningún `error*` reconocible, el link está
//   directamente malformado (alguien lo editó a mano, o se navegó acá sin
//   pasar por ningún link real) — "inválido".
//
// El caso "usado" que SÍ se puede distinguir con confianza es otro: `code`
// presente (Supabase ACABA de verificar el token_hash y emitir un code
// nuevo) pero `exchangeCodeForSession()` igual falla. Un code recién emitido
// fallando por "vencido" no tiene sentido temporal — el escenario plausible
// es que ESTA MISMA URL de callback (con este `code` puntual) ya se haya
// canjeado antes: doble carga de la pestaña, el usuario volvió atrás y
// recargó, dos pestañas abiertas desde el mismo click, etc. Ese es el
// "usado" real que se puede afirmar sin inventar una distinción falsa.
// =============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const destino = new URL("/recuperar/nueva", origin);

  if (!code) {
    // Sin `code`: o Supabase ya rechazó el `token_hash` en su propio
    // `/auth/v1/verify` (ver comentario grande arriba — "vencido" agrupa
    // vencido-por-tiempo y ya-usado, indistinguibles acá), o el link está
    // malformado.
    const huboErrorDeSupabase = searchParams.has("error") || searchParams.has("error_code");
    destino.searchParams.set("error", huboErrorDeSupabase ? "vencido" : "invalido");
    return NextResponse.redirect(destino);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // `code` recién emitido por Supabase pero el canje falla igual: ver
    // comentario grande arriba, es el caso "usado" que sí se puede afirmar
    // con confianza.
    destino.searchParams.set("error", "usado");
    return NextResponse.redirect(destino);
  }

  // Canje exitoso: ya hay sesión (la escribió `exchangeCodeForSession` vía
  // las cookies de `createSupabaseServerClient()`). Sin parámetro de error.
  return NextResponse.redirect(destino);
}
