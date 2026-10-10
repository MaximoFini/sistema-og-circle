// VGRP-32 — lectura de la tabla `profesionales`. Mismo criterio arquitectónico que
// lib/data/agentes.ts (server-only, resuelto desde un Route Handler dinámico, nunca en
// el HTML estático del dashboard).
//
// VGRP-77 — `contacto` pasa por `resolverSecreto()`: sólo con el plan completo. Antes
// bastaba con tener sesión (la tabla no tiene `nivel_requerido`, VGRP-38), lo que con
// el plan único dejaba los contactos al alcance de cualquier cuenta registrada — y
// desde VGRP-77 el Inicio sin plan monta esta grilla (borrosa) y pide este endpoint.
//
// VGRP-55 punto 1 — la LECTURA de filas se cachea (unstable_cache, mismo patrón que
// lib/data/videos.ts); el chequeo "¿hay sesión?" para decidir si se muestra `contacto`
// se sigue aplicando SIEMPRE afuera de esa caché, con los claims de cada request.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { AppMetadataClaims } from "../auth/claims";
import type { Database } from "../database.types";
import { urlPublicaFoto } from "../fotos/storage";
import { createServiceRoleClient } from "../supabase/service-role";
import { REVALIDATE_CONTENIDO_SEGUNDOS, TAG_POR_ENTIDAD } from "./admin/contenido";
import { leerConFallback } from "./cache-fallback";
import { resolverSecreto } from "./secretos";

type AdminClient = SupabaseClient<Database>;

export interface ProfesionalPublico {
  id: string;
  publicMeta: {
    nombre: string;
    rubro: string;
    descripcion: string | null;
    /** Foto de perfil (pública, no gateada). null = sin foto → iniciales. */
    fotoUrl: string | null;
  };
  contacto: string | null;
}

interface ProfesionalFila {
  id: string;
  nombre: string;
  rubro: string;
  descripcion: string | null;
  foto_path: string | null;
  /** CRUDO — sólo se cachea esto, nunca el resultado ya filtrado por sesión. */
  contacto: string | null;
}

async function obtenerFilasProfesionales(admin: AdminClient): Promise<ProfesionalFila[]> {
  const { data, error } = await admin
    .from("profesionales")
    .select("id, nombre, rubro, descripcion, foto_path, contacto")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

const obtenerFilasProfesionalesCached = unstable_cache(
  () => obtenerFilasProfesionales(createServiceRoleClient()),
  ["profesionales-filas"],
  { tags: [TAG_POR_ENTIDAD.profesionales], revalidate: REVALIDATE_CONTENIDO_SEGUNDOS },
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
      fotoUrl: urlPublicaFoto(fila.foto_path),
    },
    contacto: resolverSecreto(claims, fila.contacto),
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
