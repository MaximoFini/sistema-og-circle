// VGRP-29 — interfaz sin estado: construye URLs a partir de un `provider_ref`. No toca
// la base ni ningún secreto por sí misma (lo sensible es la FILA de `videos`, resuelta
// en lib/data/videos.ts, no acá) — por eso no necesita `server-only`.
//
// Migrar a Mux en Fase 4 (roadmap) es escribir un segundo objeto que cumpla esta
// interfaz y cambiar la línea de `videoProvider` de abajo — ningún componente de UI
// debe importar una URL/SDK de YouTube directamente (VGRP-29, criterio de aceptación).

export interface VideoProvider {
  urlEmbed(providerRef: string): string;
  urlThumbnail(providerRef: string): string;
}

export const youtubeVideoProvider: VideoProvider = {
  urlEmbed: (ref) => `https://www.youtube.com/embed/${ref}`,
  urlThumbnail: (ref) => `https://i.ytimg.com/vi/${ref}/hqdefault.jpg`,
};

export const videoProvider: VideoProvider = youtubeVideoProvider;
