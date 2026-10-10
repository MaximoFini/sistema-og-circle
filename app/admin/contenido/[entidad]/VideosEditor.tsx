"use client";

// Editor de videos del admin (/admin/contenido/videos): réplica de las grillas de
// /formacion (Stage 1 y Stage 2) pero editables. No hay tope de videos por stage.
//   - "+ Agregar video" (al final de cada stage) -> abre el panel en modo "crear" (el video
//     queda al final del stage).
//   - Casilla con video -> abre el panel en modo "editar".
//   - Arrastrar reordena DENTRO del stage: cada stage tiene su propio DndContext, así que
//     soltar un video en el otro stage no es posible por construcción.
//   - Los despublicados no aparecen en la grilla: se listan aparte, debajo de ella.
//
// La casilla se dibuja con `CasillaVideo`, la misma pieza que /formacion, y los títulos de
// sección salen de `SECCIONES_FORMACION`: no pueden divergir de lo que ve el usuario.
// Tras guardar, el estado se actualiza con la fila que devuelve la API (ver
// videos-editor-estado.ts); no se usa `router.refresh()`.

import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { SeccionSlot } from "@/components/inicio/SeccionSlot";
import { SECCIONES_FORMACION } from "@/components/inicio/secciones-formacion";
import { CasillaVideo } from "@/components/video/CasillaVideo";
import type { RenderCasilla } from "@/components/video/VideoGridReordenable";
import videoStyles from "@/components/video/video.module.css";
import type { VideoEditor, VideosParaEditor } from "@/lib/data/admin/contenido";
import type { VideoGridItem } from "@/lib/data/videos";
import styles from "./videos-editor.module.css";
import { aplicarGuardado, aplicarOrden } from "./videos-editor-estado";

// `@dnd-kit` y el panel sólo se descargan cuando hacen falta (regla 8 de
// docs/RENDIMIENTO.md): la ruta estaba en 193 kB de First Load y el presupuesto es 200.
const VideoGridReordenable = lazy(() =>
  import("@/components/video/VideoGridReordenable").then((m) => ({
    default: m.VideoGridReordenable,
  })),
);
const VideoPanel = lazy(() => import("./VideoPanel").then((m) => ({ default: m.VideoPanel })));

type Stage = 1 | 2;
const STAGES: Stage[] = [1, 2];

type PanelAbierto = { modo: "crear"; stage: Stage } | { modo: "editar"; video: VideoEditor } | null;

/** Un video del editor como el item que consume la grilla (mismo tipo que /formacion). */
function aItem(v: VideoEditor): VideoGridItem {
  return {
    id: v.id,
    titulo: v.titulo,
    descripcion: v.descripcion,
    embedUrl: null,
    thumbnailUrl: v.thumbnailUrl,
  };
}

function CasillaEditor({
  video,
  numero,
  esUltimo,
  onAbrir,
}: {
  video: VideoGridItem;
  numero: number;
  esUltimo: boolean;
  onAbrir: () => void;
}) {
  // Igual que /formacion: "disponible" sólo con miniatura (publicado y con link válido).
  const disponible = video.thumbnailUrl !== null;

  return (
    <CasillaVideo
      numero={numero}
      esUltimo={esUltimo}
      nodo={disponible ? "actual" : "bloqueado"}
      disponible={disponible}
    >
      <button
        type="button"
        className={styles.casillaBoton}
        onClick={onAbrir}
        aria-label={`Editar ${video.titulo}`}
      >
        {disponible ? (
          <span className={styles.filaMedia}>
            <span className={styles.miniatura}>
              {video.thumbnailUrl ? (
                // <img> nativo a propósito: miniatura externa, igual que en el Inicio.
                <img
                  className={videoStyles.thumbnailChica}
                  src={video.thumbnailUrl}
                  alt=""
                  width={112}
                  height={63}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </span>
            <span className={styles.textoPaso}>
              <span className={styles.tituloPaso}>{video.titulo}</span>
              <span className={styles.pista}>Editar</span>
            </span>
          </span>
        ) : (
          <>
            <span className={styles.tituloPaso}>{video.titulo}</span>
            {/* Publicado pero sin link válido: el usuario no lo ve; acá se marca para corregirlo. */}
            <span className={videoStyles.etiquetaProximamente}>Sin link válido · Editar</span>
          </>
        )}
      </button>
    </CasillaVideo>
  );
}

export function VideosEditor({ inicial }: { inicial: VideosParaEditor }) {
  const [estado, setEstado] = useState(inicial);
  const [panel, setPanel] = useState<PanelAbierto>(null);
  // Elemento que abrió el panel, para devolverle el foco al cerrarlo.
  const disparadorRef = useRef<HTMLElement | null>(null);

  const abrir = useCallback((destino: Exclude<PanelAbierto, null>) => {
    disparadorRef.current = document.activeElement as HTMLElement | null;
    setPanel(destino);
  }, []);

  const cerrar = useCallback(() => {
    setPanel(null);
    const disparador = disparadorRef.current;
    // El foco vuelve al disparador si sigue en el DOM; si la grilla se remontó (porque el
    // guardado la redibujó) no queda nada a lo que volver y no pasa nada.
    if (disparador?.isConnected) disparador.focus();
  }, []);

  const alGuardar = useCallback(
    (video: VideoEditor) => {
      setEstado((actual) => aplicarGuardado(actual, video));
      cerrar();
    },
    [cerrar],
  );

  return (
    <>
      <div className={styles.secciones}>
        {STAGES.map((stage) => {
          const { publicados, despublicados } = estado[stage];
          const items = publicados.map(aItem);
          const porId = new Map(publicados.map((v) => [v.id, v]));

          const renderCasilla: RenderCasilla = (video, numero, esUltimo) => (
            <CasillaEditor
              video={video}
              numero={numero}
              esUltimo={esUltimo}
              onAbrir={() => {
                const existente = porId.get(video.id);
                if (existente) abrir({ modo: "editar", video: existente });
              }}
            />
          );

          // La grilla copia sus props a estado interno al montarse; esta clave la remonta
          // cuando cambia lo que muestra (alta, edición, despublicar), así nunca queda vieja.
          const clave = `${stage}:${publicados
            .map((v) => `${v.id}|${v.titulo}|${v.thumbnailUrl ?? ""}`)
            .join(",")}`;

          return (
            <SeccionSlot key={stage} {...SECCIONES_FORMACION[stage]}>
              <Suspense
                fallback={
                  <div className={videoStyles.camino}>
                    {items.map((item, i) => (
                      <div key={item.id}>{renderCasilla(item, i + 1, i === items.length - 1)}</div>
                    ))}
                  </div>
                }
              >
                <VideoGridReordenable
                  key={clave}
                  videos={items}
                  renderCasilla={renderCasilla}
                  alReordenar={(ids) => setEstado((actual) => aplicarOrden(actual, stage, ids))}
                />
              </Suspense>

              <button
                type="button"
                className={`${styles.casillaBoton} ${styles.casillaVacia}`}
                onClick={() => abrir({ modo: "crear", stage })}
              >
                <span className={styles.pista}>+ Agregar video al Stage {stage}</span>
              </button>

              {despublicados.length > 0 ? (
                <div className={styles.despublicados}>
                  <p className={styles.despublicadosTitulo}>
                    Despublicados ({despublicados.length})
                  </p>
                  {despublicados.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={styles.despublicadoFila}
                      onClick={() => abrir({ modo: "editar", video: v })}
                      aria-label={`Editar ${v.titulo} (despublicado)`}
                    >
                      <span className={styles.despublicadoTitulo}>{v.titulo}</span>
                      <span className={styles.pista}>Editar</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </SeccionSlot>
          );
        })}
      </div>

      {panel ? (
        <Suspense fallback={null}>
          <VideoPanel
            key={panel.modo === "editar" ? panel.video.id : `crear-${panel.stage}`}
            {...panel}
            onGuardado={alGuardar}
            onCerrar={cerrar}
          />
        </Suspense>
      ) : null}
    </>
  );
}
