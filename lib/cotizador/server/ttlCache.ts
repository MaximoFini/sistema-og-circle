import "server-only";

// Caché en memoria del módulo con TTL, compartida por los endpoints que
// cachean una cotización de dólar (dolar/route.ts, dolar-cda/route.ts) —
// antes cada uno reimplementaba el mismo par `{ data, ts }` + comparación
// contra `Date.now()`.
export function crearTtlCache<T>(ttlMs: number) {
  let entry: { data: T; ts: number } | null = null;
  return {
    get(): T | null {
      return entry && Date.now() - entry.ts < ttlMs ? entry.data : null;
    },
    set(data: T): void {
      entry = { data, ts: Date.now() };
    },
  };
}
