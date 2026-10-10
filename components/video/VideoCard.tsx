"use client";

// VGRP-29 — un paso del camino de aprendizaje. Client Component: necesita estado local
// (expandir/colapsar el embed) y el Context de progreso (marcar visto). El <iframe> de
// abajo es el único lugar que referencia una URL de YouTube — construida por
// lib/video/provider.ts, nunca por este componente.
//
// Rediseño "camino de aprendizaje" (2026-09-13): el nodo circular a la izquierda
// refleja el progreso (visto / por ver) — no hay ningún bloqueo secuencial real entre
// pasos (todo video publicado es accesible ya, sin importar el orden).

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { VideoGridItem } from "@/lib/data/videos";
import { CasillaVideo, type EstadoNodo } from "./CasillaVideo";
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
  const { vistos, marcarVisto, videoInicial } = useProgresoVideos();
  const [expandido, setExpandido] = useState(false);
  const filaRef = useRef<HTMLDivElement>(null);

  // VGRP-88 — "Continuar" de Inicio (`/formacion?video=<id>`): el provider lee el id de la
  // URL DESPUÉS de hidratar, así que esto reacciona al cambio en vez de leerlo en el primer
  // render. Sin `embedUrl` (usuario sin plan) no se despliega nada: no hay qué reproducir.
  // El scroll espera al frame siguiente para medir con el iframe ya montado.
  const esElInicial = videoInicial !== null && video.id === videoInicial && video.embedUrl !== null;
  useEffect(() => {
    if (!esElInicial) return;
    setExpandido(true);
    const frame = requestAnimationFrame(() => {
      filaRef.current?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [esElInicial]);

  const visto = vistos.has(video.id);
  const nodo: EstadoNodo = visto ? "completado" : "actual";

  const botonVisto = (
    <button
      type="button"
      className={styles.botonVisto}
      disabled={visto}
      onClick={() => marcarVisto(video.id)}
    >
      {visto ? (
        <>
          <Icon name="check" size={14} />
          Visto
        </>
      ) : (
        "Marcar como visto"
      )}
    </button>
  );

  return (
    <CasillaVideo filaRef={filaRef} numero={numero} esUltimo={esUltimo} nodo={nodo} disponible>
      {expandido && video.embedUrl ? (
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
              // dominio. width/height = el tamaño pintado (.thumbBtn en
              // video.module.css, 112×63) — evita CLS. loading="lazy" +
              // decoding="async": son ~12 imágenes de terceros por carga de
              // Inicio, ninguna crítica para el primer render (VGRP-56 punto 6).
              <img
                className={styles.thumbnailChica}
                src={video.thumbnailUrl}
                alt=""
                width={112}
                height={63}
                loading="lazy"
                decoding="async"
              />
            ) : null}
            <span className={styles.play}>
              <Icon name="play" size={14} />
            </span>
          </button>
          <div className={styles.textoPaso}>
            <p className={styles.tituloPaso}>{video.titulo}</p>
            {botonVisto}
          </div>
        </div>
      )}
    </CasillaVideo>
  );
}
