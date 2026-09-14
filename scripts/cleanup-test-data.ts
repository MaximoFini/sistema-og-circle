// VGRP-43 — limpieza manual: borra todo dato de test que haya quedado en el
// proyecto Supabase compartido (ver test/helpers/cleanup.ts). Uso:
//
//   pnpm test:cleanup
//
// Los mismos globalSetup/globalTeardown de Vitest y Playwright llaman a esto
// automáticamente al final de `pnpm test` y `pnpm test:e2e` — este script es
// para cuando algo quedó sucio igual (una corrida que se cortó a la mitad,
// un test que falló antes de limpiar lo suyo) y hace falta correrlo a mano.

import { cleanupAllTestArtifacts, cleanupContenidoDeTest } from "../test/helpers/cleanup";

async function main() {
  const { usersDeleted } = await cleanupAllTestArtifacts();
  console.log(`Limpieza completa: ${usersDeleted} usuario(s) de test borrado(s).`);

  // VGRP-49 — agentes/videos/profesionales/servicios_financieros (VGRP-38) no
  // cuelgan de un usuario de test, así que necesitan su propio barrido — ver
  // el comentario de cleanupContenidoDeTest en test/helpers/cleanup.ts.
  const { filasBorradas } = await cleanupContenidoDeTest();
  console.log(`Limpieza completa: ${filasBorradas} fila(s) de contenido de test borrada(s).`);
}

main().catch((error) => {
  console.error("La limpieza de datos de test falló:", error);
  process.exit(1);
});
