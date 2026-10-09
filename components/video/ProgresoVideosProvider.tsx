"use client";

// VGRP-29 — sliver dinámico sobre el shell estático de InicioShell (mismo criterio que
// UserFooter/AgentesGrid, VGRP-27/30): después de hidratar, resuelve qué videos ya vio
// el usuario REAL de la sesión. Un solo Context (no dos providers por stage) porque el
// contador del header necesita ver ambos stages a la vez, y separarlos pediría la misma
// llamada de fetch inicial dos veces sin necesidad.
//
// VGRP-88: el total ya no es una constante ("X / 11") sino los videos de formación que
// están publicados hoy (`idsFormacion`, Stage 1 + Stage 2). También lee el `?video=` del
// "Continuar" de Inicio (`videoInicial`).

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { marcarVideoVisto, obtenerProgresoVideos } from "./_actions";
import { contarVistosFormacion, leerVideoInicial } from "./progreso";

interface ProgresoContexto {
  /** Todos los ids que el usuario marcó, incluso videos que ya no están publicados. Para
   *  contar usar `vistosFormacion`, no `vistos.size`. */
  vistos: Set<string>;
  /** Ids de los videos de formación publicados (Stage 1 + Stage 2, sin el explicativo de
   *  agentes). Su largo es el total del contador. */
  idsFormacion: string[];
  /** Cuántos de `idsFormacion` ya vio el usuario (VGRP-88, US-3). */
  vistosFormacion: number;
  /** VGRP-28 — true hasta que resuelva (u falle) la primera lectura de progreso. Sirve
   *  para distinguir "todavía no sabemos" de "de verdad tiene 0 videos vistos" en el
   *  contador (StatsVideos), sin generar salto de layout. */
  cargando: boolean;
  /** true solo para un admin: habilita el reorden por arrastre de los videos. */
  esAdmin: boolean;
  /** El video del `?video=<id>` de la URL (el "Continuar" de Inicio), solo si es uno de
   *  `idsFormacion`. Llega DESPUÉS de hidratar (se lee en un efecto, ver abajo), así que
   *  quien lo consuma tiene que reaccionar al cambio, no leerlo solo en el primer render. */
  videoInicial: string | null;
  marcarVisto: (videoId: string) => void;
}

const Contexto = createContext<ProgresoContexto | null>(null);

export function ProgresoVideosProvider({
  idsFormacion,
  children,
}: {
  idsFormacion: string[];
  children: ReactNode;
}) {
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [videoInicial, setVideoInicial] = useState<string | null>(null);

  // `?video=` se lee con `window.location` y NO con `useSearchParams`: en una ruta
  // estática, `useSearchParams` sin <Suspense> manda a render de cliente todo el árbol
  // hasta el boundary (y con <Suspense> el camino de videos parpadea). Se limpia de la
  // URL para que un refresh no vuelva a desplegar el video.
  useEffect(() => {
    const { videoInicial: pedido, searchLimpia } = leerVideoInicial(
      window.location.search,
      idsFormacion,
    );
    if (searchLimpia === null) return;
    setVideoInicial(pedido);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${searchLimpia}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    let cancelado = false;
    obtenerProgresoVideos()
      .then(({ videosVistos, esAdmin }) => {
        if (cancelado) return;
        setVistos(new Set(videosVistos));
        setEsAdmin(esAdmin);
      })
      .catch(() => {
        // Fallo silencioso: el contador queda en 0 hasta el próximo mount — no es
        // contenido crítico del render inicial (mismo criterio que AgentesGrid).
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  function marcarVisto(videoId: string) {
    setVistos((prev) => new Set(prev).add(videoId)); // optimista
    marcarVideoVisto(videoId)
      .then((res) => {
        if (res.ok) setVistos(new Set(res.videosVistos)); // converge al estado real
      })
      .catch(() => {
        // Sin rollback del optimista a propósito: es un contador informativo, no un
        // candado de seguridad — la próxima carga de página corrige la vista si la
        // escritura falló en el server (mismo criterio que track() en
        // app/(app)/comprar/_actions.ts).
      });
  }

  return (
    <Contexto.Provider
      value={{
        vistos,
        idsFormacion,
        vistosFormacion: contarVistosFormacion(vistos, idsFormacion),
        cargando,
        esAdmin,
        videoInicial,
        marcarVisto,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useProgresoVideos() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useProgresoVideos() usado fuera de <ProgresoVideosProvider>");
  return ctx;
}
