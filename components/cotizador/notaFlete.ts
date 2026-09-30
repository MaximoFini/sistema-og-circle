// Texto de "de dónde salió el flete que se paga: la tarifa o la cotización
// cerrada" — antes vivía duplicado (con una diferencia de texto: "TN/m³" en
// la hoja imprimible, no en el panel de resultados) en MaritimoResultado.tsx
// y MaritimoQuoteDoc.tsx.

import { FLETE, fmtNum } from "@/lib/cotizador/tarifasMaritimo";

export function notaFlete(fleteEsOverride: boolean, wm: number, conUnidad = false): string {
  if (fleteEsOverride) return "cotizado";
  const medida = conUnidad ? `${fmtNum(wm, 3)} TN/m³` : fmtNum(wm, 3);
  return `${medida} × ${FLETE.porM3} + ${FLETE.bl} BL`;
}
