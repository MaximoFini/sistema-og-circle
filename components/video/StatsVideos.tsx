"use client";

// VGRP-29 — contador "X / 11 videos completados" (MODULOS.md §2). Se actualiza solo:
// lee del mismo Context que actualiza VideoCard al marcar un video como visto.
//
// VGRP-28 — mientras `cargando` es true (la primera lectura de progreso todavía no
// resolvió) se muestra un skeleton en vez de "0 / 11", para no confundir "todavía no
// sabemos" con "de verdad tiene 0 vistos". Mismo <p> con el mismo tamaño de fuente en
// ambos casos — no genera salto de layout al resolver.
//
// Anillo de progreso (estilo anillos de Actividad de Apple): decorativo
// (aria-hidden) — el dato accesible es el texto del <p>. Se llena con
// transición porque `--progreso` está registrado como <percentage>
// (app/tokens.css).

import type { CSSProperties } from "react";
import { useProgresoVideos } from "./ProgresoVideosProvider";
import styles from "./video.module.css";

export function StatsVideos() {
  const { vistos, totalVideos, cargando } = useProgresoVideos();
  const porcentaje = cargando || totalVideos === 0 ? 0 : (vistos.size / totalVideos) * 100;

  return (
    <div className={styles.progreso}>
      <div
        className={styles.anillo}
        style={{ "--progreso": `${porcentaje}%` } as CSSProperties}
        aria-hidden="true"
      />
      <div className={styles.progresoTexto}>
        <span className={styles.progresoTitulo} aria-hidden="true">
          Formación
        </span>
        {cargando ? (
          <p className={styles.stats} role="status" aria-label="Cargando progreso de videos">
            <span className={styles.skeletonBar} />
          </p>
        ) : (
          <p className={styles.stats}>
            {vistos.size} / {totalVideos} videos completados
          </p>
        )}
      </div>
      <span className={styles.progresoPorcentaje} aria-hidden="true">
        {cargando ? "" : `${Math.round(porcentaje)}%`}
      </span>
    </div>
  );
}
