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
  /** Normaliza lo que pega el admin (link completo o id suelto) al `provider_ref`
   *  que se guarda en la base. `null` = no se reconoce como un video válido. */
  parsearRef(entrada: string): string | null;
}

// Un id de video de YouTube son SIEMPRE 11 caracteres de este alfabeto.
const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS_YOUTUBE = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * Acepta un id suelto o cualquiera de los formatos de link habituales:
 * `youtu.be/ID`, `youtube.com/watch?v=ID`, `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`
 * — con o sin protocolo y con parámetros extra (`?si=…`, `&t=…`). Bug real que motivó
 * esto: se guardó el `si=` de rastreo de un link de "Compartir" (16 chars) en vez del id,
 * y el embed mostraba "Se produjo un error".
 */
function parsearRefYoutube(entrada: string): string | null {
  const valor = entrada.trim();
  if (ID_YOUTUBE.test(valor)) return valor;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(valor) ? valor : `https://${valor}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let candidato: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") {
    candidato = url.pathname.split("/")[1] ?? null;
  } else if (HOSTS_YOUTUBE.has(host)) {
    const [primero, segundo] = url.pathname.split("/").filter(Boolean);
    if (primero === "watch") candidato = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(primero ?? "")) candidato = segundo ?? null;
  }

  return candidato && ID_YOUTUBE.test(candidato) ? candidato : null;
}

export const youtubeVideoProvider: VideoProvider = {
  parsearRef: parsearRefYoutube,
  urlEmbed: (ref) => `https://www.youtube.com/embed/${ref}`,
  // VGRP-56 punto 6 — `mqdefault.jpg` (320×180, ~un tercio del peso de
  // `hqdefault.jpg` 480×360) alcanza de sobra para el slot de 96×60 donde se
  // pinta (VideoCard.tsx, `.thumbBtn` en video.module.css). El cambio va
  // ACÁ (el único lugar permitido para una URL de YouTube, VGRP-50/VGRP-29)
  // y no en el componente.
  urlThumbnail: (ref) => `https://i.ytimg.com/vi/${ref}/mqdefault.jpg`,
};

export const videoProvider: VideoProvider = youtubeVideoProvider;
