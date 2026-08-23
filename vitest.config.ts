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
  },
});
