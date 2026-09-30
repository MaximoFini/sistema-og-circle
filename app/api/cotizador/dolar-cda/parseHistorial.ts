// VGRP-58 — parseo de la tabla HTML de cda.org.ar/historial_dolar.php.
// Port literal del regex de `api/dolar-cda.js` (vegroup@b550803).
//
// Vive en un archivo separado de `route.ts` a propósito: Next.js valida en
// build que un Route Handler sólo exporte los símbolos que conoce (GET,
// POST, runtime, dynamic, etc. — ver .next/types/.../route.ts generado) y
// falla el build si exporta cualquier otra cosa, aunque sea sólo para
// testear. `route.test.ts` no necesita importar esto (prueba el endpoint
// completo con `fetch` mockeado), pero queda separado igual por si algún
// test futuro lo necesita de forma aislada.

export interface FilaHistorial {
  fecha: string;
  compra: number;
  venta: number;
}

/**
 * Extrae las filas de la tabla del historial.
 * Formato de cada fila: <td>31/08/2026</td><td>1503.0000</td><td>1512.0000</td>
 */
export function parseHistorial(html: string): FilaHistorial[] {
  const filas: FilaHistorial[] = [];
  const re =
    /<tr>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>/gi;

  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: mismo patrón que el original
  while ((m = re.exec(html))) {
    const compra = numero(m[2] as string);
    const venta = numero(m[3] as string);
    if (compra > 0 && venta > 0) filas.push({ fecha: m[1] as string, compra, venta });
  }
  return filas;
}

// El CDA usa punto decimal ("1503.0000"). Se contempla la coma por si lo cambian.
function numero(s: string): number {
  const n = Number(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
