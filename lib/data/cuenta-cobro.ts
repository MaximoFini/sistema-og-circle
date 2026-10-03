import "server-only";

// VGRP-68 — stub fail-closed. Dueño del cuerpo: VGRP-62. No cambiar la firma.

import type { CuentaCobroVisible } from "@/lib/pagos/transferencia/contrato";

/** Cuenta de cobro activa (sólo campos visibles), o `null` si no hay ninguna. */
export async function obtenerCuentaActiva(): Promise<CuentaCobroVisible | null> {
  return null;
}
