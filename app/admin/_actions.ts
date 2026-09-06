"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/auth/server";

/**
 * VGRP-35 — cierre de sesión desde el shell del panel. Es la primera (y hoy
 * única) superficie de logout del repo: el resto de la app todavía no tiene
 * flujo de logout (ver e2e/registro-login-dashboard.spec.ts). Un Server Action
 * puede escribir cookies, así que `signOut()` limpia la sesión de verdad.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
