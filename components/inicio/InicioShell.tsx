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

import { TextLink } from "@/components/ui";
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
          <p className={styles.eyebrowNivel}>Tu cuenta</p>
          <h1 className={styles.tituloPrincipal}>Nivel {variante}</h1>
          <div className={styles.statsRow}>
            <StatsVideos />
            {/* VGRP-28 — sin módulo de envíos en Fase 2 (roadmap: Fase 3). Estado
                explícito y estático (no requiere query) en vez de un "0" que al lado
                de un contador real podría leerse como un bug. */}
            <p className={styles.envios}>Seguimiento de envíos: próximamente</p>
          </div>
        </header>

        <SeccionSlot
          eyebrow="Stage 1"
          titulo="Formación: importaciones"
          descripcion="8 videos que te llevan de cero a tu primera importación."
        >
          <VideoGrid videos={stage1} />
        </SeccionSlot>

        <SeccionSlot
          eyebrow="Herramienta"
          titulo="Calculadora de costos"
          descripcion="Cuánto te sale realmente importar, en dos minutos."
          variante="banner"
        >
          <TextLink
            href={links.calculadora}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ctaBanner}
          >
            Abrir calculadora
          </TextLink>
        </SeccionSlot>

        <SeccionSlot
          eyebrow="Stage 2"
          titulo="Formación: armá tu tienda"
          descripcion="3 videos para vender lo que importaste (Tienda Nube, Shopify)."
        >
          <VideoGrid videos={stage2} />
        </SeccionSlot>

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
          proximamente
        />

        <SeccionSlot
          eyebrow="Infraestructura"
          titulo="Profesionales al servicio"
          descripcion="Contable, automatizaciones, agencia de marketing y UGC, listos para tu operación."
        >
          <ProfesionalesGrid />
        </SeccionSlot>

        <SeccionSlot
          eyebrow="Infraestructura"
          titulo="Servicios financieros"
          descripcion="Pagos al exterior y gestión financiera para tu importación."
        >
          <ServiciosFinancierosGrid />
        </SeccionSlot>
      </div>
    </ProgresoVideosProvider>
  );
}
