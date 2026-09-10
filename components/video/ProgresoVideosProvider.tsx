"use client";

// VGRP-29 — sliver dinámico sobre el shell estático de InicioShell (mismo criterio que
// UserFooter/AgentesGrid, VGRP-27/30): después de hidratar, resuelve qué videos ya vio
// el usuario REAL de la sesión. Un solo Context (no dos providers por stage) porque el
// contador del header ("X / 11") necesita ver ambos stages a la vez, y separarlos
// pediría la misma llamada de fetch inicial dos veces sin necesidad.

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { marcarVideoVisto, obtenerProgresoVideos } from "./_actions";

interface ProgresoContexto {
  vistos: Set<string>;
  totalVideos: number;
  marcarVisto: (videoId: string) => void;
}

const Contexto = createContext<ProgresoContexto | null>(null);

export function ProgresoVideosProvider({
  totalVideos,
  children,
}: {
  totalVideos: number;
  children: ReactNode;
}) {
  const [vistos, setVistos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;
    obtenerProgresoVideos()
      .then(({ videosVistos }) => {
        if (!cancelado) setVistos(new Set(videosVistos));
      })
      .catch(() => {
        // Fallo silencioso: el contador queda en 0 hasta el próximo mount — no es
        // contenido crítico del render inicial (mismo criterio que AgentesGrid).
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
    <Contexto.Provider value={{ vistos, totalVideos, marcarVisto }}>{children}</Contexto.Provider>
  );
}

export function useProgresoVideos() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useProgresoVideos() usado fuera de <ProgresoVideosProvider>");
  return ctx;
}
