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

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { CLAVE_PROGRESO, cargarProgreso } from "@/components/inicio/datos-inicio";
import { escribirDatos, useDatosCacheados } from "@/lib/cliente/cache-datos";
import { marcarVideoVisto } from "./_actions";
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

type ProgresoVideos = Awaited<ReturnType<typeof cargarProgreso>>;

export function ProgresoVideosProvider({
  idsFormacion,
  children,
}: {
  idsFormacion: string[];
  children: ReactNode;
}) {
  // Caché de cliente (lib/cliente/cache-datos.ts): volver a Inicio desde Formación (o al
  // revés) ya tiene el progreso, sin esqueleto ni otro viaje al servidor.
  const { datos, listo } = useDatosCacheados(CLAVE_PROGRESO, cargarProgreso);
  const vistosLista = datos?.videosVistos;
  const vistos = useMemo(() => new Set(vistosLista), [vistosLista]);
  const cargando = !listo;
  const esAdmin = datos?.esAdmin ?? false;
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

  // Si la lectura falla, el contador queda en 0 (fallo silencioso, no es contenido
  // crítico) y se reintenta cuando la caché venza.

  // Las escrituras van a la caché compartida, así que Inicio ve el progreso que se marcó
  // en Formación sin volver a pedirlo.
  function escribirVistos(videosVistos: string[]) {
    escribirDatos<ProgresoVideos>(CLAVE_PROGRESO, (previo) => ({
      esAdmin: previo?.esAdmin ?? false,
      videosVistos,
    }));
  }

  function marcarVisto(videoId: string) {
    if (!vistos.has(videoId)) escribirVistos([...vistos, videoId]); // optimista
    marcarVideoVisto(videoId)
      .then((res) => {
        if (res.ok) escribirVistos(res.videosVistos); // converge al estado real
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
