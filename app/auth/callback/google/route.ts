// =============================================================================
// VGRP-76 — callback de "Continuar con Google".
//
// Separado de `../route.ts` a propósito: ese es el de recuperar contraseña y
// siempre termina en `/recuperar/nueva`. Este canjea el `code` de OAuth y
// completa lo que el formulario de registro con email haría a mano, porque un
// usuario de Google nunca pasa por ese formulario:
//
// - `profiles.nombre` desde el perfil de Google, si estaba vacío.
// - La aceptación de Términos (el texto legal está junto al botón).
// - `profiles.origen_registro`, desde la cookie que dejó el middleware.
//
// Las tres son idempotentes: en el segundo login con Google (o con una cuenta
// de email ya existente que Supabase vinculó) no pisan nada.
//
// Público por el prefijo `/auth/callback` de `middleware.ts` (quien llega acá
// todavía no tiene sesión: la crea este mismo handler).
// =============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardarOrigenSiFalta } from "@/lib/auth/origen-server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { terminosAceptadosFields } from "@/lib/legal/aceptacion";

function nombreDeGoogle(metadata: Record<string, unknown>): string | null {
  for (const clave of ["full_name", "name"]) {
    const valor = metadata[clave];
    if (typeof valor === "string" && valor.trim()) return valor.trim().slice(0, 100);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorLogin = new URL("/login?error=google", origin);

  // Sin `code`: el usuario canceló en Google (vuelve con `?error=access_denied`)
  // o alguien navegó acá a mano.
  if (!code || searchParams.has("error")) {
    return NextResponse.redirect(errorLogin);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(errorLogin);
  }

  const { user } = data;

  // Best-effort, igual que el UPDATE de `registrarse()`: la sesión ya existe
  // y no se le corta la entrada al usuario si esto falla.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("nombre, terminos_aceptados_at")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil) {
    const nombre = perfil.nombre ? null : nombreDeGoogle(user.user_metadata ?? {});
    const cambios = {
      ...(nombre ? { nombre } : {}),
      ...(perfil.terminos_aceptados_at ? {} : terminosAceptadosFields()),
    };
    if (Object.keys(cambios).length > 0) {
      await supabase.from("profiles").update(cambios).eq("id", user.id);
    }
  }

  await guardarOrigenSiFalta(user.id);

  return NextResponse.redirect(new URL(safeRedirectPath(searchParams.get("next")), origin));
}
