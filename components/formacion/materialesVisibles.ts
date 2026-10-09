// VGRP-88 — qué muestra la lista de "Materiales adicionales": los primeros 6 y un botón para
// ver el resto (US-5). Lógica pura, sin React, para testearla en node.

import { formatearTamano, type MaterialItem, type TipoMaterial } from "@/lib/materiales/tipos";

export const VISIBLES_COLAPSADO = 6;

export interface VistaLista {
  visibles: MaterialItem[];
  /** Texto del botón para expandir/colapsar, o `null` si no hace falta (6 o menos). */
  botonExpandir: string | null;
}

export function vistaLista(materiales: MaterialItem[], expandido: boolean): VistaLista {
  if (materiales.length <= VISIBLES_COLAPSADO) {
    return { visibles: materiales, botonExpandir: null };
  }
  return expandido
    ? { visibles: materiales, botonExpandir: "Ver menos" }
    : {
        visibles: materiales.slice(0, VISIBLES_COLAPSADO),
        botonExpandir: `Ver todos (${materiales.length})`,
      };
}

const ETIQUETA_TIPO: Record<TipoMaterial, string> = {
  pdf: "PDF",
  powerpoint: "PowerPoint",
  excel: "Excel",
  word: "Word",
};

export function etiquetaTipo(tipo: TipoMaterial): string {
  return ETIQUETA_TIPO[tipo];
}

/** "PDF · 2,3 MB" */
export function metaMaterial(material: Pick<MaterialItem, "tipo" | "tamanoBytes">): string {
  return `${etiquetaTipo(material.tipo)} · ${formatearTamano(material.tamanoBytes)}`;
}
