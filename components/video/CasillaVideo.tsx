// Casilla del "camino de aprendizaje", parte PRESENTACIONAL: nodo numerado a la izquierda,
// línea que une con el paso siguiente y el contenedor del contenido. Sin estado, sin
// efectos y sin contexto de progreso: no es un Client Component a propósito.
//
// La comparten dos pantallas, para que se vean idénticas:
//   - `VideoCard` (lo que ve el usuario en Inicio): el contenido es el embed, la miniatura
//     y "Marcar como visto".
//   - `CasillaEditor` (el editor de videos del admin): el contenido es un botón que abre el
//     panel de alta o edición.

import type { ReactNode, Ref } from "react";
import styles from "./video.module.css";

export type EstadoNodo = "completado" | "actual" | "bloqueado";

const CLASE_NODO: Record<EstadoNodo, string> = {
  completado: styles.nodoCompletado,
  actual: styles.nodoActual,
  bloqueado: styles.nodoBloqueado,
};

export function CasillaVideo({
  filaRef,
  numero,
  esUltimo,
  nodo,
  disponible,
  children,
}: {
  /** Para que `VideoCard` pueda hacer scroll hasta la fila (`?video=<id>`). */
  filaRef?: Ref<HTMLDivElement>;
  numero: number;
  esUltimo: boolean;
  /** Cómo se dibuja el nodo: ✓ (completado), número resaltado (actual) o número atenuado. */
  nodo: EstadoNodo;
  /** `data-disponible`: el CSS atenúa el contenido de un paso que todavía no está disponible. */
  disponible: boolean;
  children: ReactNode;
}) {
  const completado = nodo === "completado";

  return (
    <div ref={filaRef} className={styles.fila} data-disponible={disponible}>
      <div className={styles.riel}>
        <div className={`${styles.nodo} ${CLASE_NODO[nodo]}`} aria-hidden="true">
          {completado ? "✓" : numero}
        </div>
        {esUltimo ? null : (
          <div className={completado ? `${styles.linea} ${styles.lineaLlena}` : styles.linea} />
        )}
      </div>

      <div className={styles.contenido}>{children}</div>
    </div>
  );
}
