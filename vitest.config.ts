import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" lanza una excepción incondicional al importarse (ver
      // lib/config/test-stubs/server-only-empty.ts). Next.js lo resuelve así solo en
      // bundles de cliente; en vitest (Node plano) lo reemplazamos por un no-op.
      "server-only": path.resolve(__dirname, "lib/config/test-stubs/server-only-empty.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
