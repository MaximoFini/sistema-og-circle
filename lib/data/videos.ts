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
import { REVALIDATE_CONTENIDO_SEGUNDOS, TAG_POR_ENTIDAD } from "./admin/contenido";
import { CANTIDAD_STAGE, TOTAL_VIDEOS } from "./videos-config";

type AdminClient = SupabaseClient<Database>;

// Los cupos viven en un módulo sin dependencias (ver videos-config.ts) y se re-exportan
// acá para que los imports existentes no cambien.
export { CANTIDAD_STAGE, TOTAL_VIDEOS };

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
 * Sólo resuelve `embedUrl`/`thumbnailUrl` cuando la fila tiene `provider_ref` válido — es
 * el único punto de esta función con esa decisión, para que un test de integración pueda
 * verificarla directamente (US-3).
 *
 * Un video despublicado NO ocupa casilla: el filtro `publicado = true` va en la consulta,
 * ANTES de limitar a la cantidad del stage. Si se filtrara después de cortar, un
 * despublicado se llevaría un lugar y dejaría afuera a uno publicado.
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
    .order("orden", { ascending: true })
    .limit(CANTIDAD_STAGE[stage]);
  if (error) throw error;

  return armarGrilla(data ?? [], stage);
}

type FilaVideo = Pick<
  Database["public"]["Tables"]["videos"]["Row"],
  "id" | "titulo" | "descripcion" | "provider_ref" | "publicado"
>;

/**
 * Parte pura de la lectura: recorta las filas (ya ordenadas) al tamaño fijo del stage,
 * resuelve las URLs y completa con tiles de relleno. Está separada de la consulta para
 * poder testear el relleno sin depender de cuántas filas reales tenga la tabla.
 */
export function armarGrilla(filasOrdenadas: FilaVideo[], stage: 1 | 2 | 3): VideoGridItem[] {
  const cantidad = CANTIDAD_STAGE[stage];
  const filas: VideoGridItem[] = filasOrdenadas.slice(0, cantidad).map((fila) => {
    // Se normaliza también al leer: una fila vieja con un ref inválido (se llegó a
    // guardar el `si=` de un link de Compartir) queda "Próximamente" en vez de un
    // embed roto.
    const ref =
      fila.publicado && fila.provider_ref ? videoProvider.parsearRef(fila.provider_ref) : null;
    return {
      id: fila.id,
      titulo: fila.titulo,
      descripcion: fila.descripcion,
      estado: ref ? "disponible" : "proximamente",
      embedUrl: ref ? videoProvider.urlEmbed(ref) : null,
      thumbnailUrl: ref ? videoProvider.urlThumbnail(ref) : null,
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
  (stage: 1 | 2 | 3) => obtenerVideosPorStage(createServiceRoleClient(), stage),
  ["videos-por-stage"],
  { tags: [TAG_POR_ENTIDAD.videos], revalidate: REVALIDATE_CONTENIDO_SEGUNDOS },
);

/** La grilla entera como tiles de relleno: la forma degradada de `obtenerVideosStageConFallback`. */
function grillaDeRelleno(stage: 1 | 2 | 3): VideoGridItem[] {
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
 *
 * VGRP-53 — extendido a stage 3: originalmente (57ebd28) este wrapper sólo
 * cubría Stage 1/2, y `obtenerVideosStage3()` llamaba directo a
 * `obtenerVideosPorStageCached(3)`, sin try/catch. Como `InicioShell` resuelve
 * stage1/stage2/stage3/links con un único `Promise.all`, si la lectura de
 * stage 3 fallaba durante `next build`, TODO el `Promise.all` rechazaba —
 * volteando la ruta estática entera, exactamente el incidente que 57ebd28
 * vino a evitar para Stage 1/2. Ver lib/data/videos-fallback.unit.test.ts
 * para la cobertura de este hallazgo.
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

export function obtenerVideosStage3(): Promise<VideoGridItem[]> {
  return obtenerVideosStageConFallback(3);
}
