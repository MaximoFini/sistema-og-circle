// VGRP-32 — lectura de la tabla `servicios_financieros`. A diferencia de agentes
// (publicMeta + secret DENTRO de la misma fila), acá el gating es de la FILA
// COMPLETA: no hay una columna separada tipo "swift_data" en el schema (ver
// migración de VGRP-38) — la información sensible (incluido SWIFT en las filas
// nivel_requerido='avanzado') vive en `descripcion`. `titulo` siempre se muestra
// (nunca desaparece sin explicación, PRD §6); `descripcion` es lo que
// `resolverSecreto()` gatea.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppMetadataClaims, NivelAcceso } from "../auth/claims";
import type { Database } from "../database.types";
import { resolverSecreto } from "./secretos";

type AdminClient = SupabaseClient<Database>;

export interface ServicioFinancieroPublico {
  id: string;
  publicMeta: {
    titulo: string;
    nivelRequerido: NivelAcceso;
  };
  /** null = bloqueado (nivel insuficiente) — nunca se envía la descripción real. */
  descripcion: string | null;
}

export async function obtenerServiciosFinancieros(
  admin: AdminClient,
  claims: AppMetadataClaims | null,
): Promise<ServicioFinancieroPublico[]> {
  const { data, error } = await admin
    .from("servicios_financieros")
    .select("id, titulo, descripcion, nivel_requerido")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((fila) => ({
    id: fila.id,
    publicMeta: {
      titulo: fila.titulo,
      nivelRequerido: fila.nivel_requerido,
    },
    descripcion: resolverSecreto(claims, fila.nivel_requerido, fila.descripcion),
  }));
}
