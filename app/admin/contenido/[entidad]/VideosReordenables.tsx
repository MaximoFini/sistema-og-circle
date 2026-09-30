"use client";

// Listado de videos con reorden por arrastre (mouse, táctil y teclado).
// Guarda al soltar: actualiza la lista al instante y, si el PUT falla, vuelve
// al orden anterior y avisa. El orden lo define solo esta pantalla — el form de
// crear/editar ya no tiene campo "orden".

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";
import { FormError, TextLink } from "@/components/ui";
import styles from "../../admin.module.css";

export interface VideoItem {
  id: string;
  titulo: string;
  stage: number;
  publicado: boolean;
}

function FilaVideo({ video, posicion }: { video: VideoItem; posicion: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  return (
    <li
      ref={setNodeRef}
      className={`${styles.itemFilaArrastrable} ${isDragging ? styles.itemArrastrando : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.itemAgarre}
        aria-label={`Mover "${video.titulo}"`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <TextLink
        href={`/admin/contenido/videos/${video.id}`}
        className={`${styles.itemFila} ${video.publicado ? "" : styles.itemInactivo}`}
      >
        <span className={styles.itemInfo}>
          <span className={styles.itemTitulo}>{video.titulo}</span>
          <span className={styles.itemSub}>Stage {video.stage}</span>
        </span>
        <span className={styles.itemSub}>
          posición {posicion} · publicado: {video.publicado ? "sí" : "no"}
        </span>
      </TextLink>
    </li>
  );
}

export function VideosReordenables({ inicial }: { inicial: VideoItem[] }) {
  const [videos, setVideos] = useState(inicial);
  const idDnd = useId();
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titulo = (id: string | number) => videos.find((v) => v.id === id)?.titulo ?? "video";

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    const anterior = videos;
    const desde = anterior.findIndex((v) => v.id === active.id);
    const hasta = anterior.findIndex((v) => v.id === over.id);
    const nuevo = arrayMove(anterior, desde, hasta);

    setVideos(nuevo);
    setError(null);

    try {
      const res = await fetch("/api/admin/contenido/videos/orden", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: nuevo.map((v) => v.id) }),
      });
      if (res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setVideos(anterior);
      setError(data.error ?? "No se pudo guardar el orden.");
    } catch {
      setVideos(anterior);
      setError("No se pudo conectar. Reintentá.");
    }
  }

  return (
    <>
      <FormError>{error}</FormError>
      <DndContext
        id={idDnd}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Para mover un video, presioná espacio, usá las flechas arriba y abajo, y presioná espacio de nuevo para soltarlo. Escape cancela.",
          },
          announcements: {
            onDragStart: ({ active }) => `Levantaste "${titulo(active.id)}".`,
            onDragOver: ({ active, over }) =>
              over ? `"${titulo(active.id)}" está sobre "${titulo(over.id)}".` : undefined,
            onDragEnd: ({ active, over }) =>
              over
                ? `Soltaste "${titulo(active.id)}" sobre "${titulo(over.id)}".`
                : `Soltaste "${titulo(active.id)}" sin moverlo.`,
            onDragCancel: ({ active }) => `Cancelaste el movimiento de "${titulo(active.id)}".`,
          },
        }}
      >
        <SortableContext items={videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
          <ul className={styles.itemLista}>
            {videos.map((video, i) => (
              <FilaVideo key={video.id} video={video} posicion={i + 1} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}
