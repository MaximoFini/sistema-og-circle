// VGRP-30/38 (seguimiento) — lectura de la tabla real `agentes` para el directorio de
// agentes de compra en China. Reemplaza `content/agentes-demo.ts` ahora que VGRP-38 creó
// la tabla real; mismo mecanismo de gating de siempre (`resolverSecreto()`), sólo cambia
// la fuente de datos.
//
// `import "server-only"` de entrada: es el único lugar donde se lee `agentes.contacto`
// de la base y se decide si se resuelve al caller o se oculta.
//
// VGRP-55 punto 1 — la LECTURA de filas se cachea (unstable_cache, mismo patrón que
// lib/data/videos.ts), pero el gating por nivel (`resolverSecreto()`) se sigue aplicando
// SIEMPRE afuera de esa caché, con los claims REALES de cada request: `AgenteFila.contacto`
// (lo que se cachea) es el valor CRUDO de la base, nunca el ya resuelto por nivel. Si
// `resolverSecreto()` entrara al `unstable_cache`, el contacto de un agente 'avanzado'
// quedaría en una entrada de caché que puede servirle a un 'principiante' — exactamente
// el modo de falla que el canario de VGRP-50 existe para detectar. Ver lib/data/secretos.ts.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { AppMetadataClaims, NivelAcceso } from "../auth/claims";
import type { Database } from "../database.types";
import { createServiceRoleClient } from "../supabase/service-role";
import { TAG_POR_ENTIDAD } from "./admin/contenido";
import { leerConFallback } from "./cache-fallback";
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

interface AgenteFila {
  id: string;
  nombre: string;
  especialidad: string;
  nivel_requerido: NivelAcceso;
  /** CRUDO, sin resolver por nivel — sólo se cachea esto, nunca el resultado
   *  de `resolverSecreto()`. */
  contacto: string | null;
}

async function obtenerFilasAgentes(admin: AdminClient): Promise<AgenteFila[]> {
  const { data, error } = await admin
    .from("agentes")
    .select("id, nombre, especialidad, nivel_requerido, contacto")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// unstable_cache no puede recibir el cliente (no serializable) — mismo criterio que
// lib/data/videos.ts: cada invocación crea el suyo, barato sin estado de sesión que
// compartir. Tag ya disparado por el panel de contenido (lib/data/admin/contenido.ts).
const obtenerFilasAgentesCached = unstable_cache(
  () => obtenerFilasAgentes(createServiceRoleClient()),
  ["agentes-filas"],
  { tags: [TAG_POR_ENTIDAD.agentes] },
);

function resolverAgentes(filas: AgenteFila[], claims: AppMetadataClaims | null): AgentePublico[] {
  return filas.map((fila) => ({
    id: fila.id,
    publicMeta: {
      nombre: fila.nombre,
      especialidad: fila.especialidad,
      nivelRequerido: fila.nivel_requerido,
    },
    contacto: resolverSecreto(claims, fila.nivel_requerido, fila.contacto),
  }));
}

/** Núcleo testable, sin caché (cliente inyectado) — lo siguen usando los tests de
 *  integración existentes contra un `admin` real, sin pasar por `unstable_cache`. */
export async function obtenerAgentes(
  admin: AdminClient,
  claims: AppMetadataClaims | null,
): Promise<AgentePublico[]> {
  const filas = await obtenerFilasAgentes(admin);
  return resolverAgentes(filas, claims);
}

/** Variante cacheada — la usa el Route Handler (`app/api/agentes/route.ts`). El
 *  gating sigue corriendo acá, después de leer la caché, con los claims reales
 *  de ESTA request. */
export async function obtenerAgentesCacheados(
  claims: AppMetadataClaims | null,
): Promise<AgentePublico[]> {
  const filas = await leerConFallback(
    obtenerFilasAgentesCached,
    () => obtenerFilasAgentes(createServiceRoleClient()),
    "obtenerAgentesCacheados",
  );
  return resolverAgentes(filas, claims);
}
