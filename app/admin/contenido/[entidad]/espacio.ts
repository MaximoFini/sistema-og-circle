// VGRP-88 — indicador de espacio de Storage en el listado de materiales. El proyecto está en
// el plan Free de Supabase (1 GB en total), así que el admin tiene que ver cuánto queda antes
// de que una subida falle por falta de cupo.

import { formatearTamano, LIMITE_STORAGE_BYTES } from "@/lib/materiales/tipos";

/** Desde este porcentaje el indicador se muestra como advertencia. */
export const UMBRAL_ADVERTENCIA = 80;

export interface EstadoEspacio {
  texto: string;
  porcentaje: number;
  advertencia: boolean;
}

export function estadoEspacio(tamanos: number[]): EstadoEspacio {
  const usado = tamanos.reduce((total, t) => total + (Number(t) || 0), 0);
  const porcentaje = Math.min(100, Math.round((usado / LIMITE_STORAGE_BYTES) * 100));
  return {
    texto: `Espacio usado: ${formatearTamano(usado)} de ${formatearTamano(LIMITE_STORAGE_BYTES)}`,
    porcentaje,
    advertencia: porcentaje >= UMBRAL_ADVERTENCIA,
  };
}
