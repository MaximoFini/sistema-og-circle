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

import { ProgresoVideosProvider } from "@/components/video/ProgresoVideosProvider";
import { StatsVideos } from "@/components/video/StatsVideos";
import { VideoGrid } from "@/components/video/VideoGrid";
import { obtenerVideosStage1, obtenerVideosStage2, TOTAL_VIDEOS } from "@/lib/data/videos";
import { AgentesGrid } from "./AgentesGrid";
import styles from "./inicio.module.css";
import { SeccionSlot } from "./SeccionSlot";

export interface InicioShellProps {
  variante: "principiante" | "avanzado";
}

export async function InicioShell({ variante }: InicioShellProps) {
  const [stage1, stage2] = await Promise.all([obtenerVideosStage1(), obtenerVideosStage2()]);

  return (
    <ProgresoVideosProvider totalVideos={TOTAL_VIDEOS}>
      <div className={styles.shell}>
        <header className={styles.saludo}>
          <p className={styles.eyebrowNivel}>Tu cuenta</p>
          <h1 className={styles.tituloPrincipal}>Nivel {variante}</h1>
          <StatsVideos />
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
        />

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
          itemsFantasma={4}
        />

        <SeccionSlot
          eyebrow="Infraestructura"
          titulo="Servicios financieros"
          descripcion="Pagos al exterior y gestión financiera para tu importación."
          itemsFantasma={3}
        />
      </div>
    </ProgresoVideosProvider>
  );
}
