import { defineConfig, devices } from "@playwright/test";

// VGRP-43 — Playwright limitado a Chromium (STACK.md §9: "agregar navegadores
// es costo de mantenimiento sin valor a esta escala"). Los dos flujos
// críticos reales (registro→login→dashboard con nivel correcto, y pago
// aprobado→acceso activado) son de VGRP-45 y VGRP-42 — acá solo se deja el
// runner andando con un smoke test que no depende de Supabase.
export default defineConfig({
  testDir: "./e2e",
  // Decisión de entorno de VGRP-43: sin base de datos de test separada, los
  // E2E corren contra el mismo proyecto Supabase que la app (docs/TESTING.md).
  // fullyParallel + varios workers significaría varios tests escribiendo
  // sobre los mismos usuarios/tablas al mismo tiempo — un worker por vez
  // evita que se pisen entre sí mientras esto sea así.
  fullyParallel: false,
  workers: 1,
  globalTeardown: "./e2e/global-teardown.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Playwright levanta `pnpm start` sobre el build de producción y espera a
  // que responda antes de correr los tests — así el smoke test (y los E2E
  // reales que vengan después) corren contra el mismo artefacto que se
  // despliega, no contra `next dev`.
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // `pnpm test:e2e` corre con NODE_ENV=test (ver package.json — lo exige
    // db-client.ts como marca positiva de "esto es un test"). Ese servidor
    // hijo NO debe heredarlo: Next.js no carga `.env.local` cuando
    // NODE_ENV=test (a propósito, para que los tests no dependan del entorno
    // de cada máquina), y la app SÍ necesita `.env.local` para arrancar.
    env: { NODE_ENV: "production" },
  },
});
