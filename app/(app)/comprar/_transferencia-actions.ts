"use server";

// VGRP-68 — stubs fail-closed. Dueño del cuerpo: VGRP-63. No cambiar las firmas.

import type {
  IniciarComprobanteInput,
  ResultadoConfirmar,
  ResultadoIniciar,
} from "@/lib/pagos/transferencia/contrato";

export async function iniciarComprobante(
  _input: IniciarComprobanteInput,
): Promise<ResultadoIniciar> {
  return { ok: false, error: "no_disponible" };
}

export async function confirmarComprobante(_comprobanteId: string): Promise<ResultadoConfirmar> {
  return { ok: false, error: "no_disponible" };
}
