// VGRP-88 — card "Materiales adicionales" de /formacion: PDF, PowerPoint, Excel y Word para
// descargar, en el orden que define el admin. No van atados a ningún stage ni video.
//
// Server Component: el marco y el estado vacío no necesitan JS. Las filas (con "Ver todos" y
// el botón Descargar) son `ListaMateriales`, el único pedazo de cliente.

import { SeccionSlot } from "@/components/inicio/SeccionSlot";
import type { MaterialItem } from "@/lib/materiales/tipos";
import { ListaMateriales } from "./ListaMateriales";
import styles from "./materiales.module.css";

export interface MaterialesCardProps {
  materiales: MaterialItem[];
  /** Usuario sin plan: se ve la lista pero sin poder descargar. */
  bloqueado?: boolean;
}

export function MaterialesCard({ materiales, bloqueado = false }: MaterialesCardProps) {
  return (
    <SeccionSlot
      id="materiales"
      eyebrow="Materiales"
      titulo="Materiales adicionales"
      descripcion="Guías, planillas y presentaciones para descargar y usar en tu operación."
    >
      {materiales.length > 0 ? (
        <ListaMateriales materiales={materiales} bloqueado={bloqueado} />
      ) : (
        <p className={styles.vacio}>Todavía no hay materiales cargados.</p>
      )}
    </SeccionSlot>
  );
}
