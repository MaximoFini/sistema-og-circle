// VGRP-27 — armazón de la pantalla Inicio. Slots en el orden fijo de
// MODULOS.md §2 (mismo orden para ambas variantes de nivel — lo que cambia
// entre Principiante y Avanzado lo pinta VGRP-30 sección por sección, no el
// orden acá). Ver design.md, "InicioShell — slots en el orden de MODULOS.md §2".
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
// VGRP-31: suma el CTA de la calculadora (link desde Edge Config, lib/config) y el
// video explicativo del directorio de agentes (stage 3, mismo mecanismo de VGRP-29).

import { Icon } from "@/components/ui/Icon";
import { ProgresoVideosProvider } from "@/components/video/ProgresoVideosProvider";
import { StatsVideos } from "@/components/video/StatsVideos";
import { VideoGrid } from "@/components/video/VideoGrid";
import { getLinks } from "@/lib/config";
import {
  obtenerVideosStage1,
  obtenerVideosStage2,
  obtenerVideosStage3,
  TOTAL_VIDEOS,
} from "@/lib/data/videos";
import { AgentesGrid } from "./AgentesGrid";
import styles from "./inicio.module.css";
import { ProfesionalesGrid } from "./ProfesionalesGrid";
import { SeccionSlot } from "./SeccionSlot";
import { ServiciosFinancierosGrid } from "./ServiciosFinancierosGrid";

export interface InicioShellProps {
  variante: "principiante" | "avanzado";
}

export async function InicioShell({ variante }: InicioShellProps) {
  const [stage1, stage2, stage3, links] = await Promise.all([
    obtenerVideosStage1(),
    obtenerVideosStage2(),
    obtenerVideosStage3(),
    getLinks(),
  ]);

  return (
    <ProgresoVideosProvider totalVideos={TOTAL_VIDEOS}>
      <div className={styles.shell}>
        <header className={styles.saludo}>
          <div className={styles.heroTexto}>
            <p className={styles.eyebrowNivel}>Tu cuenta</p>
            <h1 className={styles.tituloPrincipal}>
              Nivel <span className={styles.nivelPalabra}>{variante}</span>
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
            <SeccionSlot
              eyebrow="Stage 1"
              titulo="Formación: importaciones"
              ancho="amplio"
              descripcion="8 videos que te llevan de cero a tu primera importación."
            >
              <VideoGrid videos={stage1} />
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
                {/* <a> y no <TextLink>: es una URL externa con look de botón primario, y
              TextLink le sumaría su propio estilo de link de texto encima. */}
                <a
                  href={links.calculadora}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.ctaBanner}
                >
                  Abrir calculadora
                  <Icon name="externo" size={16} />
                </a>
              </SeccionSlot>

              <SeccionSlot
                eyebrow="Stage 2"
                titulo="Formación: armá tu tienda"
                descripcion="3 videos para vender lo que importaste (Tienda Nube, Shopify)."
              >
                <VideoGrid videos={stage2} />
              </SeccionSlot>
            </div>
          </div>

          <SeccionSlot
            eyebrow="Infraestructura"
            titulo="Agentes de compra en China"
            descripcion="6 agentes verificados con los que ya opera Jota."
          >
            <VideoGrid videos={stage3} />
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
