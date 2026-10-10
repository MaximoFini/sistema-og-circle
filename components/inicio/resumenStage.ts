// VGRP-88 — qué muestra cada tarjeta de formación de Inicio (Stage 1 / Stage 2). Lógica
// pura, sin React, para testearla en el entorno node de vitest.

/** Lo mínimo de un video que necesita la tarjeta. Sin `embedUrl`: Inicio no reproduce. */
export interface VideoResumen {
  id: string;
  titulo: string;
  thumbnailUrl: string | null;
}

/** Recorta los videos a lo que necesita la tarjeta: el `embedUrl` no viaja al cliente de Inicio. */
export function aResumenes(videos: VideoResumen[]): VideoResumen[] {
  return videos.map(({ id, titulo, thumbnailUrl }) => ({ id, titulo, thumbnailUrl }));
}

export type EstadoTarjetaStage =
  /** Todavía no se sabe qué vio el usuario (la primera lectura de progreso no resolvió). */
  | { tipo: "cargando" }
  /** El stage no tiene videos publicados. */
  | { tipo: "proximamente" }
  /** Quedan videos por ver: `proximo` es el PRIMERO no visto según el orden del curso. */
  | { tipo: "en-curso"; vistos: number; total: number; proximo: VideoResumen }
  /** Vio todos los videos publicados del stage. */
  | { tipo: "completado"; vistos: number; total: number };

/**
 * El "próximo video" es el primero no visto en el orden del curso, no el siguiente al
 * último visto: si vio 1, 2 y 5, le propone el 3 (US-4).
 */
export function estadoTarjetaStage(
  videos: VideoResumen[],
  vistos: ReadonlySet<string>,
  cargando: boolean,
): EstadoTarjetaStage {
  if (videos.length === 0) return { tipo: "proximamente" };
  if (cargando) return { tipo: "cargando" };

  const total = videos.length;
  const cantidadVistos = videos.filter((v) => vistos.has(v.id)).length;
  const proximo = videos.find((v) => !vistos.has(v.id));

  return proximo
    ? { tipo: "en-curso", vistos: cantidadVistos, total, proximo }
    : { tipo: "completado", vistos: cantidadVistos, total };
}

/** Destino del botón Continuar: /formacion con el video en la URL (lo despliega VideoCard). */
export function hrefContinuar(videoId: string): string {
  return `/formacion?video=${encodeURIComponent(videoId)}`;
}
