// VGRP-29 — Server Component: sólo mapea la lista ya resuelta (lib/data/videos.ts) a
// tiles. Sin lógica propia — la interactividad (expandir/marcar visto) vive en
// VideoCard (Client Component).

import type { VideoGridItem } from "@/lib/data/videos";
import { VideoCard } from "./VideoCard";
import styles from "./video.module.css";

export function VideoGrid({ videos }: { videos: VideoGridItem[] }) {
  return (
    <div className={styles.grid}>
      {videos.map((video, i) => (
        <VideoCard key={video.id ?? `relleno-${i}`} video={video} />
      ))}
    </div>
  );
}
