"use client";

// VGRP-29 — tile individual de la grilla. Client Component: necesita estado local
// (expandir/colapsar el embed) y el Context de progreso (marcar visto). El <iframe> de
// abajo es el único lugar que referencia una URL de YouTube — construida por
// lib/video/provider.ts, nunca por este componente.

import { useState } from "react";
import type { VideoGridItem } from "@/lib/data/videos";
import { useProgresoVideos } from "./ProgresoVideosProvider";
import styles from "./video.module.css";

export function VideoCard({ video }: { video: VideoGridItem }) {
  const { vistos, marcarVisto } = useProgresoVideos();
  const [expandido, setExpandido] = useState(false);

  if (video.estado === "proximamente" || !video.id) {
    // Tile sintético de relleno (video.id === null) usa "Próximamente" como único
    // texto — mostrar además el título ("Próximamente" también, ver tileRelleno() en
    // lib/data/videos.ts) lo duplicaría en pantalla. Una fila real no publicada SÍ
    // tiene un título propio y vale la pena mostrarlo junto al estado.
    return (
      <div className={styles.card}>
        <div className={styles.tileVisual}>
          <span className={styles.tileProximamente}>Próximamente</span>
        </div>
        {video.id ? (
          <div className={styles.info}>
            <p className={styles.tituloVideo}>{video.titulo}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const id = video.id;
  const visto = vistos.has(id);

  return (
    <div className={styles.card}>
      {expandido && video.embedUrl ? (
        <iframe
          className={styles.embed}
          src={video.embedUrl}
          title={video.titulo}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className={styles.tileVisual}
          onClick={() => setExpandido(true)}
          aria-label={`Reproducir ${video.titulo}`}
        >
          {video.thumbnailUrl ? (
            // <img> nativo a propósito: thumbnail externo de YouTube, no un asset
            // local que next/image pueda optimizar/servir desde este dominio.
            <img className={styles.thumbnail} src={video.thumbnailUrl} alt="" />
          ) : null}
        </button>
      )}

      <div className={styles.info}>
        <p className={styles.tituloVideo}>{video.titulo}</p>
        <button
          type="button"
          className={styles.botonVisto}
          disabled={visto}
          onClick={() => marcarVisto(id)}
        >
          {visto ? "Visto" : "Marcar como visto"}
        </button>
      </div>
    </div>
  );
}
