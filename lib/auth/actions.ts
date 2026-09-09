"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";

/**
 * VGRP-35 — cierre de sesión. Compartido entre el panel de admin
 * (`app/admin/layout.tsx`) y el drawer de navegación de `(app)` (VGRP-27):
 * es el mismo flujo de logout, no se reimplementa por superficie. Un Server
 * Action puede escribir cookies, así que `signOut()` limpia la sesión de
 * verdad (a diferencia de un Server Component puro).
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
