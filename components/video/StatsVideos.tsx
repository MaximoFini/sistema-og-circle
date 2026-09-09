"use client";

// VGRP-29 — contador "X / 11 videos completados" (MODULOS.md §2). Se actualiza solo:
// lee del mismo Context que actualiza VideoCard al marcar un video como visto.

import { useProgresoVideos } from "./ProgresoVideosProvider";
import styles from "./video.module.css";

export function StatsVideos() {
  const { vistos, totalVideos } = useProgresoVideos();
  return (
    <p className={styles.stats}>
      {vistos.size} / {totalVideos} videos completados
    </p>
  );
}
