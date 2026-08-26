// VGRP-43 — limpieza manual: borra todo dato de test que haya quedado en el
// proyecto Supabase compartido (ver test/helpers/cleanup.ts). Uso:
//
//   pnpm test:cleanup
//
// Los mismos globalSetup/globalTeardown de Vitest y Playwright llaman a esto
// automáticamente al final de `pnpm test` y `pnpm test:e2e` — este script es
// para cuando algo quedó sucio igual (una corrida que se cortó a la mitad,
// un test que falló antes de limpiar lo suyo) y hace falta correrlo a mano.

import { cleanupAllTestArtifacts } from "../test/helpers/cleanup";

cleanupAllTestArtifacts()
  .then(({ usersDeleted }) => {
    console.log(`Limpieza completa: ${usersDeleted} usuario(s) de test borrado(s).`);
  })
  .catch((error) => {
    console.error("La limpieza de datos de test falló:", error);
    process.exit(1);
  });
