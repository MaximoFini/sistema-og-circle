import "server-only";

// VGRP-68 — stub fail-closed. Dueño del cuerpo: VGRP-63. No cambiar la firma.
// No verifica admin: eso lo hace el handler que lo llama (VGRP-65).

import type {
  ResolverComprobanteInput,
  ResultadoResolver,
} from "@/lib/pagos/transferencia/contrato";

export async function resolverComprobante(
  _input: ResolverComprobanteInput,
): Promise<ResultadoResolver> {
  return { ok: false, error: "error_interno" };
}
