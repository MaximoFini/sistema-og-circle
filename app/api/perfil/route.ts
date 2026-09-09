import { NextResponse } from "next/server";
import { createSupabaseServerClient, getVerifiedClaims } from "@/lib/auth/server";

// VGRP-27 — datos mínimos de perfil para el pie del drawer de navegación
// (nombre + email). El shell de `(app)` tiene que seguir estático (sin
// cookies en el layout — ver el comentario de app/(app)/layout.tsx), así que
// esto se resuelve como un fetch de cliente a este Route Handler, no leyendo
// la sesión en un Server Component del shell.
//
// Consulta contra `profiles` con el cliente normal (RLS), NUNCA service role:
// la policy ya existente ("el usuario lee sólo su fila", PRD §4.1) es
// exactamente el permiso que hace falta acá, sin bypasear nada.
export async function GET() {
  const claims = await getVerifiedClaims();
  if (!claims) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("nombre, email").single();

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo leer el perfil." }, { status: 500 });
  }

  return NextResponse.json({ nombre: data.nombre, email: data.email });
}
