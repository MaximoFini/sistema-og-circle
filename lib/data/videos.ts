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

import * as Sentry from "@sentry/nextjs";
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

/** La grilla entera como tiles de relleno: la forma degradada de `obtenerVideosStageConFallback`. */
function grillaDeRelleno(stage: 1 | 2): VideoGridItem[] {
  return Array.from({ length: CANTIDAD_STAGE[stage] }, () => tileRelleno());
}

/**
 * Fail-open sobre la lectura cacheada: si la base no responde, la grilla sale
 * en tiles de "Próximamente" en vez de propagar el error.
 *
 * El motivo es el BUILD, no el runtime. `app/(app)/dashboard/[variante]` es una
 * ruta estática (`generateStaticParams` + `dynamicParams = false`), así que este
 * await corre durante `next build`: sin este catch, cualquier problema de base o
 * de credenciales en el entorno de build —una service role key vencida fue
 * exactamente el caso— voltea el deploy entero de la app, incluidas las rutas
 * que no tienen nada que ver con videos.
 *
 * El precio, explícito: cuando falla en build, el HTML estático queda con la
 * grilla vacía servida desde el CDN hasta el próximo `revalidateTag` (el que
 * VGRP-38 ya dispara en cada escritura sobre `videos`). Se prefiere una sección
 * degradada a un sitio caído, y Sentry avisa que pasó.
 *
 * El catch va AFUERA de `unstable_cache` a propósito: así el fallo no se cachea
 * y el request siguiente vuelve a intentar la lectura real.
 */
async function obtenerVideosStageConFallback(stage: 1 | 2): Promise<VideoGridItem[]> {
  try {
    return await obtenerVideosPorStageCached(stage);
  } catch (error) {
    // Fail-open igual que lib/data/admin/audit-log.ts: sin SENTRY_DSN,
    // `captureException` es un no-op (ver instrumentation.ts) y no rompe nada.
    Sentry.captureException(error, {
      level: "error",
      tags: { "videos-grilla-degradada": "true" },
      extra: {
        stage,
        detalle:
          "No se pudo leer la tabla `videos`; la grilla de Inicio se sirve con tiles de " +
          "relleno. Si ocurrió durante `next build`, el HTML estático queda degradado " +
          "hasta el próximo revalidateTag.",
      },
    });
    return grillaDeRelleno(stage);
  }
}

export function obtenerVideosStage1(): Promise<VideoGridItem[]> {
  return obtenerVideosStageConFallback(1);
}

export function obtenerVideosStage2(): Promise<VideoGridItem[]> {
  return obtenerVideosStageConFallback(2);
}
