// VGRP-62 — siembra la cuenta de cobro de PRUEBA y la deja activa.
//
// Uso: pnpm db:seed:cuenta (ver package.json). Es un paso APARTE de
// `pnpm db:seed:test` a propósito: no hay base de test separada, y dejar una
// cuenta de prueba activa en el proyecto compartido es algo que hay que
// decidir cada vez (ver el aviso de test/helpers/cuenta-cobro-seed.ts). Se
// niega a correr si ya hay una cuenta activa real.
//
// Para sacarla después: el teardown de `pnpm test` borra toda cuenta con el
// marcador "[test]" (limpiarCuentasDeTest en test/helpers/cuenta-cobro-seed.ts).

import { createTestAdminClient } from "../../test/helpers/db-client";
import { sembrarCuentaCobroDeTest } from "../../test/helpers/cuenta-cobro-seed";

async function main() {
  const admin = createTestAdminClient();
  const { id } = await sembrarCuentaCobroDeTest(admin);
  console.log(`Cuenta de cobro de prueba activa: ${id}`);
}

main().catch((error) => {
  console.error("Seed de la cuenta de cobro falló:", error);
  process.exit(1);
});
