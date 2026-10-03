import "server-only";

// VGRP-68 — stub fail-closed. Dueño del cuerpo: VGRP-63. No cambiar la firma.

import type { ComprobanteDelUsuario } from "@/lib/pagos/transferencia/contrato";

/** Comprobante más reciente del usuario (sin `storage_path`), o `null`. */
export async function obtenerMiComprobante(_userId: string): Promise<ComprobanteDelUsuario | null> {
  return null;
}
