// Stub usado solo por vitest (ver vitest.config.ts) para reemplazar el paquete
// "server-only" durante los tests. El paquete real lanza una excepción incondicional
// al importarse (así es como fuerza que solo se use en Server Components bajo el
// bundler de Next.js); en un entorno Node plano como vitest necesitamos un no-op.
export {};
