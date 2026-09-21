// VGRP-55 — mock compartido de `next/cache` para tests que ejercitan código
// que usa `unstable_cache` de verdad (no lo mockean afuera): simula cache por
// key+args e invalidación por tag, lo mínimo que hace falta para probar
// "un update directo queda stale hasta que revalidateTag invalida el tag" —
// no es una reimplementación completa de Next.
//
// USO: `vi.mock("next/cache", () => import("../../test/helpers/fake-next-cache"))`
// (ajustar la ruta relativa según la profundidad del archivo que lo usa).
//
// OJO — el `store`/`porTag` de este módulo son un singleton por proceso de
// test: Vitest no re-ejecuta el factory de `vi.mock` en cada
// `vi.resetModules()`, así que el estado sobrevive entre tests del mismo
// archivo. Si el test necesita aislamiento entre casos (lo normal), llamar a
// `revalidateTag(tag)` en el `beforeEach` para arrancar con caché fría.

const store = new Map<string, unknown>();
const porTag = new Map<string, Set<string>>();

export function unstable_cache<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options?: { tags?: string[] },
) {
  return async (...args: A): Promise<R> => {
    const key = `${JSON.stringify(keyParts)}:${JSON.stringify(args)}`;
    if (store.has(key)) return store.get(key) as R;
    const resultado = await fn(...args);
    store.set(key, resultado);
    for (const tag of options?.tags ?? []) {
      if (!porTag.has(tag)) porTag.set(tag, new Set());
      porTag.get(tag)?.add(key);
    }
    return resultado;
  };
}

export function revalidateTag(tag: string): void {
  for (const key of porTag.get(tag) ?? []) store.delete(key);
}
