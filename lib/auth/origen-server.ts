// VGRP-76 — escritura de `profiles.origen_registro`. Separado de `origen.ts`
// porque usa el cliente service-role (el usuario no tiene grant de update
// sobre esa columna, a propósito) y `next/headers`: nada de eso puede llegar
// al middleware ni al bundle de cliente.

import "server-only";

import { cookies } from "next/headers";
import { createServiceRoleClient } from "../supabase/service-role";
import { normalizarOrigen, ORIGEN_COOKIE } from "./origen";

/**
 * Escribe el origen del registro a partir de la cookie `og_origen` (sin
 * cookie: `directo`), SÓLO si la fila todavía no tiene uno — el `is null` va
 * en el mismo UPDATE, así que dos llamadas seguidas (doble carga del
 * callback) no pisan el primero.
 *
 * Best-effort: si falla, la cuenta ya existe y el registro no se bloquea por
 * esto. Se loguea para que aparezca en Sentry.
 */
export async function guardarOrigenSiFalta(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const origen = normalizarOrigen(cookieStore.get(ORIGEN_COOKIE)?.value);

  const { error } = await createServiceRoleClient()
    .from("profiles")
    .update({ origen_registro: origen })
    .eq("id", userId)
    .is("origen_registro", null);

  if (error) {
    console.error("No se pudo guardar el origen del registro", error);
  }
}
