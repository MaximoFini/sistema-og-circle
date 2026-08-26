// VGRP-43 — limpieza automática al final de `pnpm test` (ver vitest.config.ts
// -> test.globalSetup). Corre una sola vez, después de que terminan todos los
// archivos de test.
//
// La mayoría de los tests de este repo son unitarios puros (no tocan
// Supabase), así que esto se queda en un no-op silencioso si no está
// configurado SUPABASE_SERVICE_ROLE_KEY — no tiene sentido exigirle a
// cualquiera que corra `pnpm test` que tenga el proyecto de Supabase
// configurado. El día que haya tests de integración reales (VGRP-44), correr
// contra Supabase sin esta variable simplemente falla ese test puntual con
// un error explícito (ver db-client.ts), que es lo que tiene que pasar.

import "./helpers/load-env";

export async function teardown() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const { cleanupAllTestArtifacts } = await import("./helpers/cleanup");
  const { usersDeleted } = await cleanupAllTestArtifacts();
  if (usersDeleted > 0) {
    console.log(
      `[global-teardown] Limpieza post-test: ${usersDeleted} usuario(s) de test borrado(s).`,
    );
  }
}
