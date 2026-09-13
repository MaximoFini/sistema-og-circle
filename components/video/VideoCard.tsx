"use client";

// VGRP-29 — un paso del camino de aprendizaje. Client Component: necesita estado local
// (expandir/colapsar el embed) y el Context de progreso (marcar visto). El <iframe> de
// abajo es el único lugar que referencia una URL de YouTube — construida por
// lib/video/provider.ts, nunca por este componente.
//
// Rediseño "camino de aprendizaje" (2026-09-13): el nodo circular a la izquierda
// refleja el ESTADO DE LOS DATOS (completado/disponible/próximamente) — no hay ningún
// bloqueo secuencial real entre pasos (todo "disponible" es accesible ya, sin importar
// el orden), es sólo la lectura visual del progreso.

import { useState } from "react";
import type { VideoGridItem } from "@/lib/data/videos";
import { useProgresoVideos } from "./ProgresoVideosProvider";
import styles from "./video.module.css";

export function VideoCard({
  video,
  numero,
  esUltimo,
}: {
  video: VideoGridItem;
  numero: number;
  esUltimo: boolean;
}) {
  const { vistos, marcarVisto } = useProgresoVideos();
  const [expandido, setExpandido] = useState(false);

  const disponible = video.estado === "disponible" && video.id !== null;
  const visto = disponible && vistos.has(video.id as string);

  const claseNodo = visto
    ? styles.nodoCompletado
    : disponible
      ? styles.nodoActual
      : styles.nodoBloqueado;

  const botonVisto = disponible ? (
    <button
      type="button"
      className={styles.botonVisto}
      disabled={visto}
      onClick={() => marcarVisto(video.id as string)}
    >
      {visto ? "Visto" : "Marcar como visto"}
    </button>
  ) : null;

  return (
    <div className={styles.fila}>
      <div className={styles.riel}>
        <div className={`${styles.nodo} ${claseNodo}`} aria-hidden="true">
          {visto ? "✓" : numero}
        </div>
        {esUltimo ? null : (
          <div className={visto ? `${styles.linea} ${styles.lineaLlena}` : styles.linea} />
        )}
      </div>

      <div className={styles.contenido}>
        {!disponible ? (
          // Tile sintético de relleno (video.id === null) usa "Próximamente" como único
          // texto — mostrar además la etiqueta lo duplicaría en pantalla. Una fila real
          // no publicada SÍ tiene un título propio y vale la pena mostrarlo junto al
          // estado (ver lib/data/videos.ts, tileRelleno()).
          <>
            <p className={styles.tituloPaso}>{video.titulo}</p>
            {video.id ? <span className={styles.etiquetaProximamente}>Próximamente</span> : null}
          </>
        ) : expandido && video.embedUrl ? (
          <>
            <iframe
              className={styles.embed}
              src={video.embedUrl}
              title={video.titulo}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <p className={styles.tituloPaso}>{video.titulo}</p>
            {botonVisto}
          </>
        ) : (
          <>
            <div className={styles.filaMedia}>
              <button
                type="button"
                className={styles.thumbBtn}
                onClick={() => setExpandido(true)}
                aria-label={`Reproducir ${video.titulo}`}
              >
                {video.thumbnailUrl ? (
                  // <img> nativo a propósito: thumbnail externo de YouTube, no un
                  // asset local que next/image pueda optimizar/servir desde este
                  // dominio.
                  <img className={styles.thumbnailChica} src={video.thumbnailUrl} alt="" />
                ) : null}
              </button>
              <p className={styles.tituloPaso}>{video.titulo}</p>
            </div>

            {botonVisto}
          </>
        )}
      </div>
    </div>
  );
}
