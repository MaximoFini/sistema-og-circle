"use client";

// Editor de videos del admin (/admin/contenido/videos): réplica de las grillas del Inicio
// (Stage 1 y Stage 2) pero editables.
//   - Casilla vacía  -> abre el panel en modo "crear" (el video queda al final del stage).
//   - Casilla con video -> abre el panel en modo "editar".
//   - Arrastrar reordena DENTRO del stage: cada stage tiene su propio DndContext, así que
//     soltar un video en el otro stage no es posible por construcción.
//   - Los despublicados no ocupan casilla: se listan aparte, debajo de cada grilla.
//
// La casilla se dibuja con `CasillaVideo`, la misma pieza que el Inicio, y los títulos de
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
import { CANTIDAD_STAGE } from "@/lib/data/videos-config";
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

/** Un video del editor como el item que consume la grilla (mismo tipo que el Inicio). */
function aItem(v: VideoEditor): VideoGridItem {
  return {
    id: v.id,
    titulo: v.titulo,
    descripcion: v.descripcion,
    // Igual que el Inicio: "disponible" sólo con miniatura (publicado y con link válido).
    estado: v.thumbnailUrl ? "disponible" : "proximamente",
    embedUrl: null,
    thumbnailUrl: v.thumbnailUrl,
  };
}

function itemsDeGrilla(stage: Stage, publicados: VideoEditor[]): VideoGridItem[] {
  const relleno = Math.max(0, CANTIDAD_STAGE[stage] - publicados.length);
  return [
    ...publicados.map(aItem),
    ...Array.from(
      { length: relleno },
      (): VideoGridItem => ({
        id: null,
        titulo: "Próximamente",
        descripcion: null,
        estado: "proximamente",
        embedUrl: null,
        thumbnailUrl: null,
      }),
    ),
  ];
}

function CasillaEditor({
  video,
  numero,
  esUltimo,
  stage,
  onAbrir,
}: {
  video: VideoGridItem;
  numero: number;
  esUltimo: boolean;
  stage: Stage;
  onAbrir: () => void;
}) {
  const vacia = video.id === null;
  const disponible = video.estado === "disponible";

  return (
    <CasillaVideo
      numero={numero}
      esUltimo={esUltimo}
      nodo={disponible ? "actual" : "bloqueado"}
      disponible={disponible}
    >
      <button
        type="button"
        className={`${styles.casillaBoton} ${vacia ? styles.casillaVacia : ""}`}
        onClick={onAbrir}
        aria-label={
          vacia
            ? `Agregar un video en la casilla ${numero} del Stage ${stage}`
            : `Editar ${video.titulo}`
        }
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
            {vacia ? (
              <span className={styles.pista}>+ Agregar video</span>
            ) : (
              // Publicado pero sin link válido: igual que el Inicio, "Próximamente".
              <span className={videoStyles.etiquetaProximamente}>Próximamente · Editar</span>
            )}
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
          const items = itemsDeGrilla(stage, publicados);
          const porId = new Map(publicados.map((v) => [v.id, v]));

          const renderCasilla: RenderCasilla = (video, numero, esUltimo) => (
            <CasillaEditor
              video={video}
              numero={numero}
              esUltimo={esUltimo}
              stage={stage}
              onAbrir={() => {
                const existente = video.id ? porId.get(video.id) : undefined;
                abrir(existente ? { modo: "editar", video: existente } : { modo: "crear", stage });
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
                      <div key={item.id ?? `relleno-${i}`}>
                        {renderCasilla(item, i + 1, i === items.length - 1)}
                      </div>
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
