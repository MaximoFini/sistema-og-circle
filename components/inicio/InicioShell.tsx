// VGRP-27 — armazón de la pantalla Inicio. Slots en el orden fijo de
// MODULOS.md §2. Ver design.md, "InicioShell — slots en el orden de MODULOS.md §2".
//
// VGRP-59/60 (Bloque 13 — plan único): ya no recibe `variante` como prop ni
// distingue Principiante/Avanzado. VGRP-77 suma `bloqueado` para el nivel
// 'ninguno' (ver `sinEmbed` más abajo).
//
// El ticker de depósitos/CUIT de MODULOS.md §2 queda explícitamente fuera
// (requirements.md, Open questions — es Fase 3 según el roadmap; a confirmar
// con Jero, no bloquea).
//
// VGRP-29: pasa a async para leer las grillas de Stage 1/2 (lib/data/videos.ts,
// cacheado + revalidado por tag — no rompe el rendering estático, ver design-vgrp29.md).
// Envuelve todo en <ProgresoVideosProvider> porque el contador de stats del header y
// las dos grillas comparten el mismo estado de "videos vistos".
//
// VGRP-31: suma el CTA de la calculadora y el video explicativo del directorio de
// agentes (stage 3, mismo mecanismo de VGRP-29).
//
// VGRP-57: la calculadora pasa a ser una página de la app (`/calculadora`). El CTA
// deja de leer `links.calculadora` de Edge Config y, como era lo único que este
// componente leía de ahí, ya no llama a `getLinks()`.

import NextLink from "next/link";
import { ProgresoVideosProvider } from "@/components/video/ProgresoVideosProvider";
import { StatsVideos } from "@/components/video/StatsVideos";
import { VideoGrid } from "@/components/video/VideoGrid";
import {
  obtenerVideosStage1,
  obtenerVideosStage2,
  obtenerVideosStage3,
  TOTAL_VIDEOS,
  type VideoGridItem,
} from "@/lib/data/videos";
import { AgentesGrid } from "./AgentesGrid";
import styles from "./inicio.module.css";
import { ProfesionalesGrid } from "./ProfesionalesGrid";
import { SeccionSlot } from "./SeccionSlot";
import { ServiciosFinancierosGrid } from "./ServiciosFinancierosGrid";
import { SECCIONES_FORMACION } from "./secciones-formacion";

// VGRP-77: `bloqueado` es el Inicio de quien no tiene plan, que se ve borroso
// detrás de <TarjetaDesbloqueo>. El blur no protege nada, así que lo sensible
// se saca ACÁ, antes de renderizar: los `embedUrl` de los videos quedan en
// `null` (títulos y miniaturas sí viajan). Las grillas de agentes,
// profesionales y servicios no cambian: sus secretos ya los resuelve cada
// Route Handler según los claims de quien pide.
function sinEmbed(videos: VideoGridItem[]): VideoGridItem[] {
  return videos.map((video) => ({ ...video, embedUrl: null }));
}

export async function InicioShell({ bloqueado = false }: { bloqueado?: boolean }) {
  const grillas = await Promise.all([
    obtenerVideosStage1(),
    obtenerVideosStage2(),
    obtenerVideosStage3(),
  ]);
  const [stage1, stage2, stage3] = bloqueado ? grillas.map(sinEmbed) : grillas;

  // Plan único: el admin siempre puede reordenar los videos arrastrando (ver
  // VideoGrid) — antes esto dependía de la variante ('avanzado' vs
  // 'principiante'), ya no hay esa distinción. Sin plan no hay nada que
  // reordenar: el fondo es inerte.
  const reordenable = !bloqueado;

  return (
    <ProgresoVideosProvider totalVideos={TOTAL_VIDEOS}>
      <div className={styles.shell}>
        <header className={styles.saludo}>
          <div className={styles.heroTexto}>
            <p className={styles.eyebrowNivel}>Tu cuenta</p>
            <h1 className={styles.tituloPrincipal}>
              {bloqueado ? (
                "OG Circle"
              ) : (
                <>
                  Nivel <span className={styles.nivelPalabra}>completo</span>
                </>
              )}
            </h1>
            <p className={styles.lede}>
              Tu camino para importar: formación paso a paso, herramientas y la red de contactos del
              círculo.
            </p>
          </div>
          <div className={styles.statsRow}>
            <StatsVideos />
            {/* VGRP-28 — sin módulo de envíos en Fase 2 (roadmap: Fase 3). Estado
                explícito y estático (no requiere query) en vez de un "0" que al lado
                de un contador real podría leerse como un bug. */}
            <p className={styles.envios}>Seguimiento de envíos: próximamente</p>
          </div>
        </header>

        <div className={styles.grilla}>
          {/* Bloque propio para Stage 1 + columna lateral: acota el `sticky` de la
              columna a este bloque (sin él, se deslizaría sobre el resto de la grilla). */}
          <div className={styles.bentoPrincipal}>
            <SeccionSlot {...SECCIONES_FORMACION[1]} ancho="amplio">
              <VideoGrid videos={stage1} reordenable={reordenable} />
            </SeccionSlot>

            {/* Columna lateral de la grilla bento (desde 1024px): calculadora + Stage 2,
              al lado del camino largo de Stage 1. En mobile es un bloque más. */}
            <div className={styles.columnaLateral}>
              <SeccionSlot
                eyebrow="Herramienta"
                titulo="Calculadora de costos"
                descripcion="Cuánto te sale realmente importar, en dos minutos."
                variante="banner"
                icono="calculadora"
              >
                {/* NextLink y no <TextLink>: navegación interna con look de botón
                    primario, y TextLink le sumaría su propio estilo de link de texto. */}
                <NextLink href="/calculadora" className={styles.ctaBanner}>
                  Abrir calculadora
                </NextLink>
              </SeccionSlot>

              <SeccionSlot {...SECCIONES_FORMACION[2]}>
                <VideoGrid videos={stage2} reordenable={reordenable} />
              </SeccionSlot>
            </div>
          </div>

          <SeccionSlot
            eyebrow="Infraestructura"
            titulo="Agentes de compra en China"
            descripcion="6 agentes verificados con los que ya opera VeGroup."
          >
            <VideoGrid videos={stage3} reordenable={reordenable} />
            <AgentesGrid />
          </SeccionSlot>

          <SeccionSlot
            eyebrow="Comunidad"
            titulo="Hablá con otros importadores"
            descripcion="Un espacio para compartir dudas y avances con el resto del círculo."
            variante="banner"
            icono="comunidad"
            proximamente
          />

          <SeccionSlot
            eyebrow="Infraestructura"
            titulo="Profesionales al servicio"
            ancho="mitad"
            descripcion="Contable, automatizaciones, agencia de marketing y UGC, listos para tu operación."
          >
            <ProfesionalesGrid />
          </SeccionSlot>

          <SeccionSlot
            eyebrow="Infraestructura"
            titulo="Servicios financieros"
            ancho="mitad"
            descripcion="Pagos al exterior y gestión financiera para tu importación."
          >
            <ServiciosFinancierosGrid />
          </SeccionSlot>
        </div>
      </div>
    </ProgresoVideosProvider>
  );
}
