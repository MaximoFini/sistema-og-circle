// VGRP-32 — lectura de la tabla `servicios_financieros`. A diferencia de agentes
// (publicMeta + secret DENTRO de la misma fila), acá el gating es de la FILA
// COMPLETA: no hay una columna separada tipo "swift_data" en el schema (ver
// migración de VGRP-38) — la información sensible (incluido SWIFT en las filas
// nivel_requerido='avanzado') vive en `descripcion`. `titulo` siempre se muestra
// (nunca desaparece sin explicación, PRD §6); `descripcion` es lo que
// `resolverSecreto()` gatea.
//
// VGRP-55 punto 1 — la LECTURA de filas se cachea (unstable_cache, mismo patrón que
// lib/data/videos.ts); `resolverSecreto()` se sigue aplicando SIEMPRE afuera de esa
// caché, con los claims reales de cada request — ver el comentario extenso de
// lib/data/agentes.ts (mismo mecanismo, mismo riesgo: es el canario SWIFT de VGRP-52).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { AppMetadataClaims, NivelAcceso } from "../auth/claims";
import type { Database } from "../database.types";
import { createServiceRoleClient } from "../supabase/service-role";
import { TAG_POR_ENTIDAD } from "./admin/contenido";
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

interface ServicioFila {
  id: string;
  titulo: string;
  nivel_requerido: NivelAcceso;
  /** CRUDA (puede traer datos SWIFT) — sólo se cachea esto, nunca el resultado
   *  ya filtrado por `resolverSecreto()`. */
  descripcion: string | null;
}

async function obtenerFilasServicios(admin: AdminClient): Promise<ServicioFila[]> {
  const { data, error } = await admin
    .from("servicios_financieros")
    .select("id, titulo, descripcion, nivel_requerido")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

const obtenerFilasServiciosCached = unstable_cache(
  () => obtenerFilasServicios(createServiceRoleClient()),
  ["servicios-financieros-filas"],
  { tags: [TAG_POR_ENTIDAD.servicios_financieros] },
);

function resolverServicios(
  filas: ServicioFila[],
  claims: AppMetadataClaims | null,
): ServicioFinancieroPublico[] {
  return filas.map((fila) => ({
    id: fila.id,
    publicMeta: {
      titulo: fila.titulo,
      nivelRequerido: fila.nivel_requerido,
    },
    descripcion: resolverSecreto(claims, fila.nivel_requerido, fila.descripcion),
  }));
}

/** Núcleo testable, sin caché — lo siguen usando los tests de integración existentes. */
export async function obtenerServiciosFinancieros(
  admin: AdminClient,
  claims: AppMetadataClaims | null,
): Promise<ServicioFinancieroPublico[]> {
  const filas = await obtenerFilasServicios(admin);
  return resolverServicios(filas, claims);
}

/** Variante cacheada — la usa `app/api/servicios-financieros/route.ts`. */
export async function obtenerServiciosFinancierosCacheados(
  claims: AppMetadataClaims | null,
): Promise<ServicioFinancieroPublico[]> {
  let filas: ServicioFila[];
  try {
    filas = await obtenerFilasServiciosCached();
  } catch {
    // Ver el comentario extenso en lib/data/agentes.ts (misma clase de
    // fallback): `unstable_cache` necesita el runtime real de Next.
    filas = await obtenerFilasServicios(createServiceRoleClient());
  }
  return resolverServicios(filas, claims);
}
