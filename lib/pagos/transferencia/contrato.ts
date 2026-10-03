// Contrato del Bloque 13. Dueño: VGRP-68.
// Cambiarlo = avisar a quien tenga VGRP-62, 63, 64 y 65 (PR aparte y revisado).

export const BUCKET_COMPROBANTES = "comprobantes";
export const MAX_BYTES_COMPROBANTE = 5 * 1024 * 1024;
export const MIMES_COMPROBANTE = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type MimeComprobante = (typeof MIMES_COMPROBANTE)[number];

export type CuentaCobroVisible = {
  id: string;
  titular: string;
  cuit: string;
  banco: string;
  cbuCvu: string;
  alias: string;
  notas: string | null;
};

export type EstadoComprobante = "pendiente" | "aprobado" | "rechazado";

export type ComprobanteDelUsuario = {
  id: string;
  estado: EstadoComprobante;
  motivoRechazo: string | null;
  montoEsperadoArs: number;
  createdAt: string;
  resueltoAt: string | null;
};

export type ErrorComprobante =
  | "sin_sesion"
  | "ya_tiene_plan"
  | "compras_pausadas"
  | "sin_cuenta_activa"
  | "pendiente_existente"
  | "rate_limit"
  | "archivo_invalido"
  | "no_encontrado"
  | "no_disponible";

export type IniciarComprobanteInput = { mimeType: MimeComprobante; tamanoBytes: number };

export type ResultadoIniciar =
  | { ok: true; comprobanteId: string; path: string; token: string }
  | { ok: false; error: ErrorComprobante };

export type ResultadoConfirmar = { ok: true } | { ok: false; error: ErrorComprobante };

export type DecisionComprobante = "aprobado" | "rechazado";

export type ResolverComprobanteInput = {
  comprobanteId: string;
  decision: DecisionComprobante;
  actorId: string;
  motivo?: string;
};

export type ResultadoResolver =
  | { ok: true; nivelAplicado: boolean }
  | { ok: false; error: "ya_resuelto" | "no_encontrado" | "motivo_requerido" | "error_interno" };
