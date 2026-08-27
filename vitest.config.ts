import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" lanza una excepción incondicional al importarse (ver
      // lib/config/test-stubs/server-only-empty.ts). Next.js lo resuelve así solo en
      // bundles de cliente; en vitest (Node plano) lo reemplazamos por un no-op.
      "server-only": path.resolve(__dirname, "lib/config/test-stubs/server-only-empty.ts"),
      // Mismo alias que `paths` en tsconfig.json. Sin esto, cualquier módulo que
      // use `@/…` (lo idiomático en Next) queda fuera del alcance de los tests y
      // hay que escribir imports relativos de varios niveles solo para testear.
      //
      // La barra final importa: Vite matchea los alias de tipo string por prefijo,
      // así que un `"@"` pelado también agarraría los paquetes scoped
      // (`@react-email/components`, `@supabase/ssr`).
      "@/": `${path.resolve(__dirname)}/`,
    },
  },
  // `tsconfig.json` declara `jsx: "preserve"` porque quien transforma el JSX es
  // Next, no tsc. Vite hereda esa opción y sin esto deja el JSX sin transformar,
  // con lo cual falla al parsear cualquier `.tsx` que entre en un test (hoy,
  // `app/api/auth/send-email/route.tsx`, que arma la plantilla con JSX).
  // El transformador de Vite 8 es oxc, no esbuild — por eso la clave es `oxc`.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
    // e2e/ son specs de Playwright (usan su propio `test`, no el de vitest);
    // sin este exclude, el glob por defecto de vitest (*.spec.ts incluido)
    // los agarra también y falla al no encontrar el runner de Playwright.
    exclude: ["node_modules/**", "e2e/**"],
    // VGRP-43: limpieza obligatoria de datos de test al terminar la suite
    // (no hay Supabase de test separado — ver test/global-teardown.ts).
    globalSetup: ["./test/global-teardown.ts"],
    // VGRP-44/45 — descubierto corriendo `pnpm test` con todos los archivos
    // de integración juntos por primera vez: por default, Vitest corre los
    // ARCHIVOS de test en paralelo (varios workers), no sólo los `it()` de
    // un mismo archivo. Como no hay Supabase de test separado (mismo
    // proyecto real para todo, ver arriba), varios archivos de integración
    // logueando/creando usuarios al mismo tiempo disparan el rate limit
    // NATIVO de Supabase Auth (`429 over_request_rate_limit`) — no es un bug
    // de ningún test puntual, es contención real contra el mismo proyecto.
    // `playwright.config.ts` ya resolvía esto mismo con `workers: 1`; acá es
    // el equivalente para Vitest.
    fileParallelism: false,
    // Complemento de lo anterior: `test/helpers/with-auth-retry.ts` reintenta
    // con backoff exponencial (hasta ~1.5+3+6+12+24s) cuando el rate limit de
    // arriba igual aparece con `fileParallelism: false` (es un límite de
    // VOLUMEN total en una ventana de tiempo, no sólo de concurrencia). El
    // timeout default de Vitest (5s por test) es más corto que esa espera
    // acumulada, así que un test que necesita reintentar puede "fallar" por
    // timeout en vez de por el error real. 30s de margen alcanza para el
    // peor caso sin esconder un test genuinamente colgado (nada en esta
    // suite hace trabajo real que tarde eso).
    testTimeout: 30_000,
  },
});
