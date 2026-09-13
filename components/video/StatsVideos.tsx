"use client";

// VGRP-29 — contador "X / 11 videos completados" (MODULOS.md §2). Se actualiza solo:
// lee del mismo Context que actualiza VideoCard al marcar un video como visto.
//
// VGRP-28 — mientras `cargando` es true (la primera lectura de progreso todavía no
// resolvió) se muestra un skeleton en vez de "0 / 11", para no confundir "todavía no
// sabemos" con "de verdad tiene 0 vistos". Mismo <p> con el mismo tamaño de fuente en
// ambos casos — no genera salto de layout al resolver.

import { useProgresoVideos } from "./ProgresoVideosProvider";
import styles from "./video.module.css";

export function StatsVideos() {
  const { vistos, totalVideos, cargando } = useProgresoVideos();

  if (cargando) {
    return (
      <p className={styles.stats} role="status" aria-label="Cargando progreso de videos">
        <span className={styles.skeletonBar} />
      </p>
    );
  }

  return (
    <p className={styles.stats}>
      {vistos.size} / {totalVideos} videos completados
    </p>
  );
}
