// Helpers de querystring compartidos por las pantallas del panel con filtros
// (usuarios, pagos, auditoría): todas usan un `<form method="get">` nativo.

/** El form nativo manda `campo=` cuando un input queda vacío o un select está
 *  en "Todos": eso es "sin filtro", no un valor inválido. */
export function param(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** Aplica `param()` a todo el querystring, listo para `searchSchema.safeParse`
 *  (Zod descarta las claves que el schema no declara). */
export function normalizarParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, param(v)]));
}

/** `yyyy-mm-dd` del `<input type="date">` -> límites ISO del día completo
 *  (lo que esperan los schemas de lib/data/admin/*). */
export function rangoDia(desde?: string, hasta?: string): { desde?: string; hasta?: string } {
  return {
    desde: desde ? `${desde}T00:00:00.000Z` : undefined,
    hasta: hasta ? `${hasta}T23:59:59.999Z` : undefined,
  };
}
