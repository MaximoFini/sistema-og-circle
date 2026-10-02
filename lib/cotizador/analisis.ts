// Análisis de marketing: lo que comparten el endpoint
// (`app/api/cotizador/analisis-marketing`) y el cliente (`lib/cotizador/api.ts`)
// — la normalización del resultado y el protocolo del streaming.
//
// Client-safe: sin "server-only".

import type { AnalisisMarketing } from "./api";

/**
 * Eventos del streaming, uno por línea (NDJSON). El servidor manda `texto`
 * con cada fragmento que escribe el modelo, y cierra con `fin` (el análisis
 * validado y normalizado, que es el definitivo) o con `error`.
 */
export type EventoAnalisis =
  | { tipo: "texto"; texto: string }
  | { tipo: "fin"; analisis: AnalisisMarketing }
  | { tipo: "error"; error: string };

/**
 * Lo que devolvió el modelo (completo, o a medio escribir) con la forma de
 * `AnalisisMarketing`: textos sólo si son strings no vacíos, y los dos
 * arrays siempre arrays de strings (el modelo a veces manda un string suelto).
 * Cualquier otra cosa —incluido `undefined` o un JSON que no es objeto— da un
 * análisis vacío.
 */
export function normalizarAnalisis(valor: unknown): AnalisisMarketing {
  const o: Record<string, unknown> =
    valor !== null && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  return {
    publicoObjetivo: texto(o.publicoObjetivo),
    angulosVenta: lista(o.angulosVenta),
    ideasContenido: lista(o.ideasContenido),
    campanaSugerida: texto(o.campanaSugerida),
    precioSugerido: texto(o.precioSugerido),
    riesgoPrincipal: texto(o.riesgoPrincipal),
  };
}

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function lista(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
