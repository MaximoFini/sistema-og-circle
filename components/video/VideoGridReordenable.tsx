"use client";

// Versión de VideoGrid para el ADMIN: mismo camino de aprendizaje (reusa VideoCard), pero
// cada paso trae un agarre para arrastrarlo. Guarda al soltar en
// PUT /api/admin/contenido/videos/orden y, si falla, vuelve al orden anterior. Los tiles de
// relleno ("Próximamente", sin id) no se mueven: siempre quedan al final.
//
// Solo se importa desde ReordenAdmin vía `lazy()` — nunca directo — para que dnd-kit no
// viaje en el bundle de quien no es admin.

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
import type { VideoGridItem } from "@/lib/data/videos";
import { VideoCard } from "./VideoCard";
import styles from "./video.module.css";

function PasoArrastrable({
  video,
  numero,
  esUltimo,
}: {
  video: VideoGridItem;
  numero: number;
  esUltimo: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id as string });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.pasoArrastrable} ${isDragging ? styles.pasoArrastrando : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <VideoCard video={video} numero={numero} esUltimo={esUltimo} />
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.agarreAdmin}
        aria-label={`Mover "${video.titulo}"`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
    </div>
  );
}

export function VideoGridReordenable({ videos }: { videos: VideoGridItem[] }) {
  const relleno = videos.filter((v) => v.id === null);
  const [reales, setReales] = useState(() => videos.filter((v) => v.id !== null));
  const idDnd = useId();
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titulo = (id: string | number) => reales.find((v) => v.id === id)?.titulo ?? "video";

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    const anterior = reales;
    const nuevo = arrayMove(
      anterior,
      anterior.findIndex((v) => v.id === active.id),
      anterior.findIndex((v) => v.id === over.id),
    );

    setReales(nuevo);
    setError(null);

    try {
      const res = await fetch("/api/admin/contenido/videos/orden", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: nuevo.map((v) => v.id) }),
      });
      if (res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setReales(anterior);
      setError(data.error ?? "No se pudo guardar el orden.");
    } catch {
      setReales(anterior);
      setError("No se pudo conectar. Reintentá.");
    }
  }

  const total = reales.length + relleno.length;

  return (
    <>
      {error ? (
        <p role="alert" className={styles.errorReorden}>
          {error}
        </p>
      ) : null}
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
        <SortableContext
          items={reales.map((v) => v.id as string)}
          strategy={verticalListSortingStrategy}
        >
          <div className={styles.camino}>
            {reales.map((video, i) => (
              <PasoArrastrable
                key={video.id as string}
                video={video}
                numero={i + 1}
                esUltimo={i === total - 1}
              />
            ))}
            {relleno.map((video, i) => (
              <VideoCard
                key={`relleno-${i}`}
                video={video}
                numero={reales.length + i + 1}
                esUltimo={reales.length + i === total - 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
