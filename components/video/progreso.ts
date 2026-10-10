// VGRP-88 — lógica pura del progreso de formación, sin React ni `window`, para poder
// testearla en el entorno node de vitest. La usa ProgresoVideosProvider.

/**
 * Cuántos de los videos de formación (Stage 1 + Stage 2 publicados) ya vio el usuario.
 *
 * `vistos` guarda ids que ya no cuentan: videos despublicados, borrados, o el explicativo
 * de agentes (stage 3). Si el contador usara `vistos.size`, esos ids lo inflarían y podría
 * mostrar más vistos que el total ("12 / 11"). Se cuenta la intersección.
 */
export function contarVistosFormacion(vistos: ReadonlySet<string>, idsFormacion: string[]): number {
  let n = 0;
  for (const id of idsFormacion) {
    if (vistos.has(id)) n += 1;
  }
  return n;
}

export interface VideoInicialLeido {
  /** El `?video=` de la URL, solo si es de un video de formación publicado; si no, `null`. */
  videoInicial: string | null;
  /**
   * La query string (con `?`, o vacía) sin el parámetro `video`, para que un refresh no
   * vuelva a desplegar el video. `null` si la URL no traía `video` y no hay nada que limpiar.
   */
  searchLimpia: string | null;
}

/**
 * Lee `?video=<id>` (el "Continuar" de Inicio) y lo valida contra `idsFormacion`.
 * Un id que no existe, no está publicado o no es reproducible para este usuario da
 * `videoInicial: null`: la página se muestra normal, sin desplegar nada (US-4).
 */
export function leerVideoInicial(search: string, idsFormacion: string[]): VideoInicialLeido {
  const params = new URLSearchParams(search);
  if (!params.has("video")) return { videoInicial: null, searchLimpia: null };

  const pedido = params.get("video");
  const videoInicial = pedido && idsFormacion.includes(pedido) ? pedido : null;

  params.delete("video");
  const resto = params.toString();
  return { videoInicial, searchLimpia: resto ? `?${resto}` : "" };
}
