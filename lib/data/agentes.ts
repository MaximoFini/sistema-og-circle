// VGRP-30/38 (seguimiento) — lectura de la tabla real `agentes` para el directorio de
// agentes de compra en China. Reemplaza `content/agentes-demo.ts` ahora que VGRP-38 creó
// la tabla real; mismo mecanismo de gating de siempre (`resolverSecreto()`), sólo cambia
// la fuente de datos.
//
// `import "server-only"` de entrada: es el único lugar donde se lee `agentes.contacto`
// de la base y se decide si se resuelve al caller o se oculta.
//
// A diferencia de `lib/data/videos.ts` (VGRP-29), esto SÍ gatea por nivel por fila
// (`nivel_requerido` varía por agente) y por eso NO se cachea/estatiza: se llama siempre
// desde un Route Handler dinámico con los claims REALES de la request, nunca desde el
// render de una ruta estática — mismo motivo documentado en lib/data/secretos.ts.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppMetadataClaims, NivelAcceso } from "../auth/claims";
import type { Database } from "../database.types";
import { resolverSecreto } from "./secretos";

type AdminClient = SupabaseClient<Database>;

export interface AgentePublico {
  id: string;
  publicMeta: {
    nombre: string;
    especialidad: string;
    nivelRequerido: NivelAcceso;
  };
  /** null = bloqueado (nivel insuficiente) — nunca se envía el contacto real. */
  contacto: string | null;
}

export async function obtenerAgentes(
  admin: AdminClient,
  claims: AppMetadataClaims | null,
): Promise<AgentePublico[]> {
  const { data, error } = await admin
    .from("agentes")
    .select("id, nombre, especialidad, nivel_requerido, contacto")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((fila) => ({
    id: fila.id,
    publicMeta: {
      nombre: fila.nombre,
      especialidad: fila.especialidad,
      nivelRequerido: fila.nivel_requerido,
    },
    contacto: resolverSecreto(claims, fila.nivel_requerido, fila.contacto),
  }));
}
