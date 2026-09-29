// VGRP-29 — Server Component: sólo mapea la lista ya resuelta (lib/data/videos.ts) a
// filas del camino. Sin lógica propia — la interactividad (expandir/marcar visto) vive
// en VideoCard (Client Component).
//
// Rediseño "camino de aprendizaje" (2026-09-13): cada video es un paso conectado por una
// línea vertical, no una tarjeta suelta en una grilla — mismo criterio visual que un
// path de curso (Duolingo-like). El único estado real que se representa es el de los
// datos: "completado" (visto), "disponible" (no gateado, ver lib/data/videos.ts) o
// "próximamente" — no hay un bloqueo secuencial real entre pasos, es sólo la lectura
// visual del progreso.
//
// `reordenable` (solo la variante Avanzado): un admin puede reordenar los pasos
// arrastrando. El camino de abajo sigue siendo el HTML estático para todos; ReordenAdmin
// lo reemplaza en el cliente únicamente si la sesión es admin.

import type { VideoGridItem } from "@/lib/data/videos";
import { ReordenAdmin } from "./ReordenAdmin";
import { VideoCard } from "./VideoCard";
import styles from "./video.module.css";

export function VideoGrid({
  videos,
  reordenable = false,
}: {
  videos: VideoGridItem[];
  reordenable?: boolean;
}) {
  const camino = (
    <div className={styles.camino}>
      {videos.map((video, i) => (
        <VideoCard
          key={video.id ?? `relleno-${i}`}
          video={video}
          numero={i + 1}
          esUltimo={i === videos.length - 1}
        />
      ))}
    </div>
  );

  return reordenable ? <ReordenAdmin videos={videos}>{camino}</ReordenAdmin> : camino;
}
