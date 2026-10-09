// VGRP-29 — lectura de la tabla `videos` para las secciones de formación (Stage 1/2) y el
// video explicativo de agentes (stage 3).
//
// VGRP-88: la formación vive en /formacion y deja de tener un tamaño fijo. Cada stage
// muestra EXACTAMENTE los videos publicados y reproducibles (sin tope y sin tiles de
// relleno "Próximamente"): Stage 2 va a tener ~15 videos y crece a medida que se graban.
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

/** Red de contención de la consulta, no un tope de producto (docs/RENDIMIENTO.md, regla 7:
 *  todo listado lleva `.limit()` explícito). Ningún stage se acerca a este número. */
const LIMITE_FILAS = 200;

/** Un video publicado y reproducible. Ya no existen los tiles de relleno: todo ítem es una
 *  fila real de la tabla. */
export interface VideoGridItem {
  id: string;
  titulo: string;
  descripcion: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Núcleo testable (cliente inyectado, mismo patrón que lib/data/admin/contenido.ts).
 * Sólo devuelve filas `publicado=true` con `provider_ref` válido — es el único punto con
 * esa decisión, para que un test de integración pueda verificarla directamente (US-3).
 */
export async function obtenerVideosPorStage(
  admin: AdminClient,
  stage: 1 | 2 | 3,
): Promise<VideoGridItem[]> {
  const { data, error } = await admin
    .from("videos")
    .select("id, titulo, descripcion, provider_ref, publicado, orden")
    .eq("stage", stage)
    .eq("publicado", true)
    .not("provider_ref", "is", null)
    .order("orden", { ascending: true })
    .limit(LIMITE_FILAS);
  if (error) throw error;

  return armarGrilla(data ?? []);
}

type FilaVideo = Pick<
  Database["public"]["Tables"]["videos"]["Row"],
  "id" | "titulo" | "descripcion" | "provider_ref" | "publicado"
>;

/**
 * Parte pura de la lectura: resuelve las URLs de las filas (ya ordenadas) y descarta las que
 * no se pueden reproducir. Separada de la consulta para poder testearla sin base.
 *
 * Se normaliza también al leer: una fila vieja con un ref inválido (se llegó a guardar el
 * `si=` de un link de Compartir) se descarta en vez de mostrar un embed roto.
 */
export function armarGrilla(filasOrdenadas: FilaVideo[]): VideoGridItem[] {
  return filasOrdenadas.flatMap((fila) => {
    const ref =
      fila.publicado && fila.provider_ref ? videoProvider.parsearRef(fila.provider_ref) : null;
    if (!ref) return [];
    return [
      {
        id: fila.id,
        titulo: fila.titulo,
        descripcion: fila.descripcion,
        embedUrl: videoProvider.urlEmbed(ref),
        thumbnailUrl: videoProvider.urlThumbnail(ref),
      },
    ];
  });
}

// unstable_cache no puede recibir el cliente (no serializable) — cada invocación crea
// el suyo; sin estado de sesión que compartir, es barato (mismo criterio que
// createServiceRoleClient() en el resto del repo). El tag es el que VGRP-38 ya dispara
// con revalidateTag() en cada escritura sobre `videos`.
const obtenerVideosPorStageCached = unstable_cache(
  (stage: 1 | 2 | 3) => obtenerVideosPorStage(createServiceRoleClient(), stage),
  ["videos-por-stage"],
  { tags: [TAG_POR_ENTIDAD.videos] },
);

/**
 * Fail-open sobre la lectura cacheada: si la base no responde, devuelve la lista vacía
 * (que la UI muestra como "los videos están en camino") en vez de propagar el error.
 *
 * El motivo es el BUILD, no el runtime. `app/(app)/dashboard/[variante]` y
 * `app/(app)/formacion/[variante]` son rutas estáticas (`generateStaticParams` +
 * `dynamicParams = false`), así que este await corre durante `next build`: sin este catch,
 * cualquier problema de base o de credenciales en el entorno de build —una service role key
 * vencida fue exactamente el caso— voltea el deploy entero de la app, incluidas las rutas
 * que no tienen nada que ver con videos.
 *
 * El precio, explícito: cuando falla en build, el HTML estático queda sin videos servido
 * desde el CDN hasta el próximo `revalidateTag` (el que VGRP-38 ya dispara en cada
 * escritura sobre `videos`) o hasta que venza el `revalidate` de la página. Se prefiere una
 * sección degradada a un sitio caído, y Sentry avisa que pasó.
 *
 * El catch va AFUERA de `unstable_cache` a propósito: así el fallo no se cachea
 * y el request siguiente vuelve a intentar la lectura real.
 *
 * VGRP-53 — cubre también stage 3: `InicioShell` resuelve los stages con un único
 * `Promise.all`, así que un stage sin fallback voltearía la ruta estática entera. Ver
 * lib/data/videos-fallback.unit.test.ts.
 */
async function obtenerVideosStageConFallback(stage: 1 | 2 | 3): Promise<VideoGridItem[]> {
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
          "No se pudo leer la tabla `videos`; la sección se sirve sin videos. Si ocurrió " +
          "durante `next build`, el HTML estático queda degradado hasta el próximo " +
          "revalidateTag.",
      },
    });
    return [];
  }
}

export function obtenerVideosStage1(): Promise<VideoGridItem[]> {
  return obtenerVideosStageConFallback(1);
}

export function obtenerVideosStage2(): Promise<VideoGridItem[]> {
  return obtenerVideosStageConFallback(2);
}

export function obtenerVideosStage3(): Promise<VideoGridItem[]> {
  return obtenerVideosStageConFallback(3);
}

// VGRP-77 — sin plan, los embeds no viajan al cliente. La pantalla borrosa (Inicio y, desde
// VGRP-88, /formacion) se renderiza igual con títulos y miniaturas, pero con `embedUrl`
// en `null`: el blur no protege nada, así que lo sensible se saca ANTES de renderizar.
export function sinEmbed(videos: VideoGridItem[]): VideoGridItem[] {
  return videos.map((video) => ({ ...video, embedUrl: null }));
}

/** Ids de los videos de formación (Stage 1 + Stage 2): el total del contador de progreso.
 *  El explicativo de agentes (stage 3) no cuenta. */
export function idsDeFormacion(...stages: VideoGridItem[][]): string[] {
  return stages.flat().map((video) => video.id);
}
