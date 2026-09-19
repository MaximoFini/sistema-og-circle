// VGRP-32 — lectura de la tabla `profesionales`. Mismo criterio arquitectónico que
// lib/data/agentes.ts (server-only, resuelto desde un Route Handler dinámico, nunca en
// el HTML estático del dashboard), pero SIN gating por nivel: la tabla no tiene
// `nivel_requerido` (decisión confirmada 2026-09-09, VGRP-38) — mismo acceso para
// Principiante y Avanzado. `contacto` sólo se resuelve si hay sesión real (claims no
// nulo); no hay ninguna condición de nivel que evaluar.
//
// VGRP-55 punto 1 — la LECTURA de filas se cachea (unstable_cache, mismo patrón que
// lib/data/videos.ts); el chequeo "¿hay sesión?" para decidir si se muestra `contacto`
// se sigue aplicando SIEMPRE afuera de esa caché, con los claims de cada request.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { AppMetadataClaims } from "../auth/claims";
import type { Database } from "../database.types";
import { createServiceRoleClient } from "../supabase/service-role";
import { TAG_POR_ENTIDAD } from "./admin/contenido";
import { leerConFallback } from "./cache-fallback";

type AdminClient = SupabaseClient<Database>;

export interface ProfesionalPublico {
  id: string;
  publicMeta: {
    nombre: string;
    rubro: string;
    descripcion: string | null;
  };
  contacto: string | null;
}

interface ProfesionalFila {
  id: string;
  nombre: string;
  rubro: string;
  descripcion: string | null;
  /** CRUDO — sólo se cachea esto, nunca el resultado ya filtrado por sesión. */
  contacto: string | null;
}

async function obtenerFilasProfesionales(admin: AdminClient): Promise<ProfesionalFila[]> {
  const { data, error } = await admin
    .from("profesionales")
    .select("id, nombre, rubro, descripcion, contacto")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

const obtenerFilasProfesionalesCached = unstable_cache(
  () => obtenerFilasProfesionales(createServiceRoleClient()),
  ["profesionales-filas"],
  { tags: [TAG_POR_ENTIDAD.profesionales] },
);

function resolverProfesionales(
  filas: ProfesionalFila[],
  claims: AppMetadataClaims | null,
): ProfesionalPublico[] {
  return filas.map((fila) => ({
    id: fila.id,
    publicMeta: {
      nombre: fila.nombre,
      rubro: fila.rubro,
      descripcion: fila.descripcion,
    },
    contacto: claims ? fila.contacto : null,
  }));
}

/** Núcleo testable, sin caché — lo siguen usando los tests de integración existentes. */
export async function obtenerProfesionales(
  admin: AdminClient,
  claims: AppMetadataClaims | null,
): Promise<ProfesionalPublico[]> {
  const filas = await obtenerFilasProfesionales(admin);
  return resolverProfesionales(filas, claims);
}

/** Variante cacheada — la usa `app/api/profesionales/route.ts`. */
export async function obtenerProfesionalesCacheados(
  claims: AppMetadataClaims | null,
): Promise<ProfesionalPublico[]> {
  const filas = await leerConFallback(
    obtenerFilasProfesionalesCached,
    () => obtenerFilasProfesionales(createServiceRoleClient()),
    "obtenerProfesionalesCacheados",
  );
  return resolverProfesionales(filas, claims);
}
