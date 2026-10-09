"use client";

// VGRP-88 — resumen de un stage de formación en Inicio: cuánto avanzó el usuario y cuál es
// su próximo video, con un "Continuar" que lo lleva directo a /formacion. Reemplaza a las
// grillas de Stage 1/2 que vivían en Inicio (ahora están en /formacion).
//
// Client Component: el progreso del usuario lo resuelve `ProgresoVideosProvider` después de
// hidratar (Inicio es estático). El marco de vidrio y su encabezado ("Stage 1", título,
// descripción) los pone el <SeccionSlot> que lo envuelve en InicioShell; acá va sólo el
// contenido. Los estados (cargando / próximamente / en curso / completado) salen de
// `estadoTarjetaStage`.

import NextLink from "next/link";
import { useProgresoVideos } from "@/components/video/ProgresoVideosProvider";
import inicio from "./inicio.module.css";
import { estadoTarjetaStage, hrefContinuar, type VideoResumen } from "./resumenStage";
import styles from "./tarjeta-stage.module.css";

export function TarjetaStage({ videos }: { videos: VideoResumen[] }) {
  const { vistos, cargando } = useProgresoVideos();
  const estado = estadoTarjetaStage(videos, vistos, cargando);

  if (estado.tipo === "proximamente") {
    return (
      <div className={styles.resumen}>
        <p className={styles.mensaje}>Los videos de este stage están en camino.</p>
      </div>
    );
  }

  if (estado.tipo === "cargando") {
    return (
      <div className={styles.resumen} role="status" aria-label="Cargando tu progreso">
        <div className={styles.esqueleto} />
      </div>
    );
  }

  const porcentaje = Math.round((estado.vistos / estado.total) * 100);

  return (
    <div className={styles.resumen}>
      <div className={styles.progreso}>
        <p className={styles.progresoTexto}>
          {estado.vistos} / {estado.total} videos
        </p>
        <div
          className={styles.barra}
          role="progressbar"
          aria-label="Progreso del stage"
          aria-valuemin={0}
          aria-valuemax={estado.total}
          aria-valuenow={estado.vistos}
        >
          <div
            className={styles.barraLlena}
            style={{ "--p": `${porcentaje}%` } as React.CSSProperties}
          />
        </div>
      </div>

      {estado.tipo === "en-curso" ? (
        <>
          <div className={styles.proximo}>
            <div className={styles.miniatura}>
              {estado.proximo.thumbnailUrl ? (
                // <img> nativo a propósito (mismo criterio que VideoCard): miniatura externa
                // de YouTube, no un asset local que next/image pueda optimizar. Con tamaño
                // declarado y carga diferida (docs/RENDIMIENTO.md, regla 5).
                <img
                  className={styles.miniaturaImg}
                  src={estado.proximo.thumbnailUrl}
                  alt=""
                  width={112}
                  height={63}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </div>
            <div className={styles.proximoTexto}>
              <p className={styles.proximoEtiqueta}>Próximo video</p>
              <p className={styles.proximoTitulo}>{estado.proximo.titulo}</p>
            </div>
          </div>
          {/* NextLink y no <Button>: navega, no ejecuta una acción (mismo criterio que
              el CTA de la calculadora en InicioShell). */}
          <NextLink href={hrefContinuar(estado.proximo.id)} className={inicio.ctaBanner}>
            Continuar
          </NextLink>
        </>
      ) : (
        <>
          <span className={styles.completado}>Completado</span>
          <NextLink href="/formacion" className={inicio.ctaBanner}>
            Ver de nuevo
          </NextLink>
        </>
      )}
    </div>
  );
}
