"use client";

// Sliver dinámico sobre la grilla estática de videos: para cualquier usuario que no sea
// admin devuelve `children` (el camino ya prerenderizado, sin tocar nada). Solo si la
// sesión es admin monta la versión arrastrable — con `lazy()` para que `@dnd-kit` (y el
// código de reorden) se descargue únicamente en ese caso y no engorde el First Load JS
// de Inicio para el resto de los usuarios (regla 8 de docs/RENDIMIENTO.md). Mientras el
// chunk carga se sigue viendo el camino estático (`fallback`), así no hay salto visual.

import { lazy, type ReactNode, Suspense } from "react";
import type { VideoGridItem } from "@/lib/data/videos";
import { useProgresoVideos } from "./ProgresoVideosProvider";

const VideoGridReordenable = lazy(() =>
  import("./VideoGridReordenable").then((m) => ({ default: m.VideoGridReordenable })),
);

export function ReordenAdmin({
  videos,
  children,
}: {
  videos: VideoGridItem[];
  children: ReactNode;
}) {
  const { esAdmin } = useProgresoVideos();
  if (!esAdmin) return children;

  return (
    <Suspense fallback={children}>
      <VideoGridReordenable videos={videos} />
    </Suspense>
  );
}
