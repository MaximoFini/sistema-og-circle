// VGRP-29 — lectura de la tabla `videos` para las grillas de Stage 1/2 de Inicio.
//
// `import "server-only"` de entrada (pedido explícito del ticket): este archivo es el
// único lugar donde se lee `provider_ref` de la base y se decide si se resuelve a una
// URL o se oculta. Ninguna fila cruda (con `provider_ref` incluido) sale de acá — sólo
// el `VideoGridItem` ya resuelto.
//
// Service role (no un cliente con RLS) a propósito: requirements-vgrp29.md (Non-goals)
// documenta que este ticket NO gatea por nivel (el propio ticket lo pide explícito) —
// la grilla es la misma para todos los usuarios autenticados. La policy de RLS de
// VGRP-38 sigue activa como red de seguridad para cualquier consulta directa que no
// pase por acá.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "../database.types";
import { createServiceRoleClient } from "../supabase/service-role";
import { videoProvider } from "../video/provider";
import { TAG_POR_ENTIDAD } from "./admin/contenido";

type AdminClient = SupabaseClient<Database>;

/** Tamaño fijo de cada grilla (PRD / MODULOS.md §2) — no depende de cuántas filas haya
 *  cargadas todavía en la tabla, ver requirements-vgrp29.md "Decisiones asumidas". */
export const CANTIDAD_STAGE = { 1: 8, 2: 3 } as const;
export const TOTAL_VIDEOS = CANTIDAD_STAGE[1] + CANTIDAD_STAGE[2];

export interface VideoGridItem {
  /** null = tile sintético de relleno (la fila todavía no existe en la tabla); nunca
   *  marcable como visto. */
  id: string | null;
  titulo: string;
  descripcion: string | null;
  estado: "disponible" | "proximamente";
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

function tileRelleno(): VideoGridItem {
  return {
    id: null,
    titulo: "Próximamente",
    descripcion: null,
    estado: "proximamente",
    embedUrl: null,
    thumbnailUrl: null,
  };
}

/**
 * Núcleo testable (cliente inyectado, mismo patrón que lib/data/admin/contenido.ts).
 * Sólo resuelve `embedUrl`/`thumbnailUrl` cuando la fila está `publicado=true` Y tiene
 * `provider_ref` — es el único punto de esta función con esa decisión, para que un test
 * de integración pueda verificarla directamente (US-3).
 */
export async function obtenerVideosPorStage(
  admin: AdminClient,
  stage: 1 | 2,
): Promise<VideoGridItem[]> {
  const { data, error } = await admin
    .from("videos")
    .select("id, titulo, descripcion, provider_ref, publicado, orden")
    .eq("stage", stage)
    .order("orden", { ascending: true });
  if (error) throw error;

  const cantidad = CANTIDAD_STAGE[stage];
  const filas: VideoGridItem[] = (data ?? []).slice(0, cantidad).map((fila) => {
    const disponible = fila.publicado && Boolean(fila.provider_ref);
    return {
      id: fila.id,
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      estado: disponible ? "disponible" : "proximamente",
      embedUrl: disponible ? videoProvider.urlEmbed(fila.provider_ref as string) : null,
      thumbnailUrl: disponible ? videoProvider.urlThumbnail(fila.provider_ref as string) : null,
    };
  });

  while (filas.length < cantidad) {
    filas.push(tileRelleno());
  }
  return filas;
}

// unstable_cache no puede recibir el cliente (no serializable) — cada invocación crea
// el suyo; sin estado de sesión que compartir, es barato (mismo criterio que
// createServiceRoleClient() en el resto del repo). El tag es el que VGRP-38 ya dispara
// con revalidateTag() en cada escritura sobre `videos`.
const obtenerVideosPorStageCached = unstable_cache(
  (stage: 1 | 2) => obtenerVideosPorStage(createServiceRoleClient(), stage),
  ["videos-por-stage"],
  { tags: [TAG_POR_ENTIDAD.videos] },
);

export function obtenerVideosStage1(): Promise<VideoGridItem[]> {
  return obtenerVideosPorStageCached(1);
}

export function obtenerVideosStage2(): Promise<VideoGridItem[]> {
  return obtenerVideosPorStageCached(2);
}
