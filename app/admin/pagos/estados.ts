// Estados que hoy puede tomar un pago de Mercado Pago en el ledger. `estado` es
// texto libre en la base (`pagos.estado`), pero estos son los valores reales que
// escribe el webhook (VGRP-23). Compartido entre el filtro del ledger y la ficha
// de usuario, para que el admin vea siempre la misma palabra en castellano.
export const ESTADOS = [
  "approved",
  "pending",
  "in_process",
  "rejected",
  "refunded",
  "cancelled",
] as const;

export const ESTADO_LABELS: Record<(typeof ESTADOS)[number], string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

/** Label legible de un estado; si llega uno desconocido, se muestra tal cual. */
export function estadoLabel(estado: string): string {
  return (ESTADO_LABELS as Record<string, string>)[estado] ?? estado;
}

const NIVEL_LABELS: Record<string, string> = {
  completo: "Acceso completo",
  ninguno: "Sin acceso",
};

export function nivelLabel(nivel: string): string {
  return NIVEL_LABELS[nivel] ?? nivel;
}

const PROVEEDOR_LABELS: Record<string, string> = {
  mercadopago: "Mercado Pago",
  transferencia: "Transferencia",
  // Filas creadas por el seed local: la referencia es inventada, no se muestra.
  seed: "Pago de prueba",
};

/** "Mercado Pago · operación 123…", o sólo "Pago de prueba" para el seed. */
export function origenPago(p: { proveedor: string; proveedor_ref: string }): string {
  const label = PROVEEDOR_LABELS[p.proveedor] ?? p.proveedor;
  return p.proveedor === "seed" ? label : `${label} · operación ${p.proveedor_ref}`;
}
