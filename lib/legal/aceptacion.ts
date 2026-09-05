import { TERMINOS_VERSION } from "./version";

/**
 * Columnas de `profiles` que registran la aceptación de términos vigente.
 *
 * No hace el `UPDATE` en sí — sólo arma los valores. `_actions.ts` los
 * mergea en el mismo `.update()` que ya escribe `nombre`/`telefono` tras el
 * registro, en vez de sumar un round-trip nuevo a la base. Vive como función
 * (y no repetido inline) para que un flujo de registro futuro que hoy no
 * existe —OAuth con Google/Apple, VGRP-20/21, que crea usuarios sin pasar
 * por este formulario— tenga un único lugar de donde tomar exactamente los
 * mismos valores en vez de re-derivarlos.
 */
export function terminosAceptadosFields() {
  return {
    terminos_aceptados_at: new Date().toISOString(),
    terminos_version: TERMINOS_VERSION,
  };
}
