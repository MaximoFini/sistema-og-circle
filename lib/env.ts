// Lectura de variables de entorno con falla explícita, compartida entre la
// app (lib/auth/server.ts) y los scripts de test (test/helpers/db-client.ts).
//
// Deliberadamente SIN `import "server-only"`: a diferencia de lib/auth/server.ts,
// este módulo lo importan también scripts que corren fuera de Next.js (seed,
// limpieza, Playwright global teardown) — "server-only" lanzaría ahí porque
// esos procesos no pasan por el bundler de Next que lo neutraliza.

export function getEnv(name: string, hint?: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.${hint ? ` ${hint}` : ""}`);
  }
  return value;
}
