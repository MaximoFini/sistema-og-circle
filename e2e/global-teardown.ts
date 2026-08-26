// VGRP-43 — limpieza automática al final de `pnpm test:e2e` (ver
// playwright.config.ts -> globalTeardown). El smoke test de hoy no toca
// Supabase, pero los flujos reales que vienen en VGRP-45/42 sí (registro,
// pago) — esto asegura que ningún E2E deja usuarios/pagos de test colgados
// en el proyecto compartido, sea cual sea el resultado de la corrida.

import "../test/helpers/load-env";

async function globalTeardown() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const { cleanupAllTestArtifacts } = await import("../test/helpers/cleanup");
  const { usersDeleted } = await cleanupAllTestArtifacts();
  if (usersDeleted > 0) {
    console.log(
      `[global-teardown] Limpieza post-E2E: ${usersDeleted} usuario(s) de test borrado(s).`,
    );
  }
}

export default globalTeardown;
