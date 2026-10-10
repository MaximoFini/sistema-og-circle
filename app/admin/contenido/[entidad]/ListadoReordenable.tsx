"use client";

// Listado con reorden por arrastre (mouse, táctil y teclado), para las entidades que se
// ordenan así: videos y, desde VGRP-88, materiales. Guarda al soltar: actualiza la lista al
// instante y, si el PUT falla, vuelve al orden anterior y avisa. El orden lo define solo esta
// pantalla — el form de crear/editar no tiene campo "orden".

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

export interface ItemReordenable {
  id: string;
  titulo: string;
  /** Segunda línea (ej. "Stage 2", "PDF · 2,3 MB"). */
  subtitulo: string;
  publicado: boolean;
}

export interface ListadoReordenableProps {
  /** Entidad de la URL: arma el link de edición y el endpoint de orden. */
  entidad: "videos" | "materiales";
  inicial: ItemReordenable[];
}

/** Sustantivo para los anuncios del lector de pantalla y el fallback de títulos. */
const SUSTANTIVO = { videos: "video", materiales: "material" } as const;

function Fila({
  entidad,
  item,
  posicion,
}: {
  entidad: ListadoReordenableProps["entidad"];
  item: ItemReordenable;
  posicion: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

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
        aria-label={`Mover "${item.titulo}"`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <TextLink
        href={`/admin/contenido/${entidad}/${item.id}`}
        className={`${styles.itemFila} ${item.publicado ? "" : styles.itemInactivo}`}
      >
        <span className={styles.itemInfo}>
          <span className={styles.itemTitulo}>{item.titulo}</span>
          <span className={styles.itemSub}>{item.subtitulo}</span>
        </span>
        <span className={styles.itemSub}>
          posición {posicion} · {item.publicado ? "publicado" : "Oculto"}
        </span>
      </TextLink>
    </li>
  );
}

export function ListadoReordenable({ entidad, inicial }: ListadoReordenableProps) {
  const [items, setItems] = useState(inicial);
  const idDnd = useId();
  const [error, setError] = useState<string | null>(null);
  const sustantivo = SUSTANTIVO[entidad];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const titulo = (id: string | number) => items.find((v) => v.id === id)?.titulo ?? sustantivo;

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;

    const anterior = items;
    const desde = anterior.findIndex((v) => v.id === active.id);
    const hasta = anterior.findIndex((v) => v.id === over.id);
    const nuevo = arrayMove(anterior, desde, hasta);

    setItems(nuevo);
    setError(null);

    try {
      const res = await fetch(`/api/admin/contenido/${entidad}/orden`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: nuevo.map((v) => v.id) }),
      });
      if (res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setItems(anterior);
      setError(data.error ?? "No se pudo guardar el orden.");
    } catch {
      setItems(anterior);
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
            draggable: `Para mover un ${sustantivo}, presioná espacio, usá las flechas arriba y abajo, y presioná espacio de nuevo para soltarlo. Escape cancela.`,
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
        <SortableContext items={items.map((v) => v.id)} strategy={verticalListSortingStrategy}>
          <ul className={styles.itemLista}>
            {items.map((item, i) => (
              <Fila key={item.id} entidad={entidad} item={item} posicion={i + 1} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}
