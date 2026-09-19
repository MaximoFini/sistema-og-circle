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
  // VGRP-56 punto 6 — `mqdefault.jpg` (320×180, ~un tercio del peso de
  // `hqdefault.jpg` 480×360) alcanza de sobra para el slot de 96×60 donde se
  // pinta (VideoCard.tsx, `.thumbBtn` en video.module.css). El cambio va
  // ACÁ (el único lugar permitido para una URL de YouTube, VGRP-50/VGRP-29)
  // y no en el componente.
  urlThumbnail: (ref) => `https://i.ytimg.com/vi/${ref}/mqdefault.jpg`,
};

export const videoProvider: VideoProvider = youtubeVideoProvider;
