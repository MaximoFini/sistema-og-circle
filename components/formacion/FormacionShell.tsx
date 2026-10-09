// VGRP-88 — pantalla /formacion: Stage 1, Stage 2 y la card de Materiales adicionales.
//
// Server Component ESTÁTICO (lo sirve `app/(app)/formacion/[variante]/page.tsx`, una
// variante por nivel): no lee cookies ni claims. Lo que depende del usuario (qué videos
// vio) lo resuelve `ProgresoVideosProvider` en el cliente, igual que en Inicio.
//
// El camino de videos (`VideoGrid` / `VideoCard`) es el mismo de siempre: cada video se
// despliega en su propia fila, no hay modal. Esta pantalla sólo cambia DÓNDE vive.
//
// `bloqueado` es la versión de quien no tiene plan, que se ve borrosa detrás de
// <TarjetaDesbloqueo> (VGRP-77). El blur no protege nada, así que lo sensible se saca ACÁ,
// antes de renderizar: los `embedUrl` quedan en `null` (títulos y miniaturas sí viajan) y
// la lista de materiales va sin acción de descarga (US-6).

import inicio from "@/components/inicio/inicio.module.css";
import { SeccionSlot } from "@/components/inicio/SeccionSlot";
import { ProgresoVideosProvider } from "@/components/video/ProgresoVideosProvider";
import { StatsVideos } from "@/components/video/StatsVideos";
import { VideoGrid } from "@/components/video/VideoGrid";
import { obtenerMateriales } from "@/lib/data/materiales";
import {
  idsDeFormacion,
  obtenerVideosStage1,
  obtenerVideosStage2,
  sinEmbed,
  type VideoGridItem,
} from "@/lib/data/videos";
import styles from "./formacion.module.css";
import { MaterialesCard } from "./MaterialesCard";

function Stage({
  id,
  eyebrow,
  titulo,
  descripcion,
  videos,
  reordenable,
}: {
  id: string;
  eyebrow: string;
  titulo: string;
  descripcion: string;
  videos: VideoGridItem[];
  reordenable: boolean;
}) {
  return (
    <SeccionSlot id={id} eyebrow={eyebrow} titulo={titulo} descripcion={descripcion}>
      {videos.length > 0 ? (
        <VideoGrid videos={videos} reordenable={reordenable} />
      ) : (
        <p className={styles.vacio}>Los videos de este stage están en camino.</p>
      )}
    </SeccionSlot>
  );
}

export async function FormacionShell({ bloqueado = false }: { bloqueado?: boolean }) {
  const [stage1Crudo, stage2Crudo, materiales] = await Promise.all([
    obtenerVideosStage1(),
    obtenerVideosStage2(),
    obtenerMateriales(),
  ]);
  const stage1 = bloqueado ? sinEmbed(stage1Crudo) : stage1Crudo;
  const stage2 = bloqueado ? sinEmbed(stage2Crudo) : stage2Crudo;

  return (
    <ProgresoVideosProvider idsFormacion={idsDeFormacion(stage1, stage2)}>
      <div className={inicio.shell}>
        <header className={inicio.saludo}>
          <div className={inicio.heroTexto}>
            <p className={inicio.eyebrowNivel}>Tu camino</p>
            <h1 className={inicio.tituloPrincipal}>Formación</h1>
            <p className={inicio.lede}>
              Los videos paso a paso para importar y para vender lo que importaste, y los materiales
              para descargar.
            </p>
          </div>
          <div className={inicio.statsRow}>
            <StatsVideos />
          </div>
        </header>

        <div className={inicio.grilla}>
          {/* Sin tope: cada stage muestra todos los videos publicados (US-2). El admin los
              reordena arrastrando acá mismo (ReordenAdmin) o en el panel. */}
          <Stage
            id="stage-1"
            eyebrow="Stage 1"
            titulo="Formación: importaciones"
            descripcion="Los videos que te llevan de cero a tu primera importación."
            videos={stage1}
            reordenable={!bloqueado}
          />
          <Stage
            id="stage-2"
            eyebrow="Stage 2"
            titulo="Formación: armá tu tienda"
            descripcion="Los videos para vender lo que importaste (Tienda Nube, Shopify)."
            videos={stage2}
            reordenable={!bloqueado}
          />
          <MaterialesCard materiales={materiales} bloqueado={bloqueado} />
        </div>
      </div>
    </ProgresoVideosProvider>
  );
}
