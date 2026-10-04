import type { NivelAcceso } from "@/lib/database.types";
import { Constants } from "@/lib/database.types";

// Etiquetas en castellano de los valores internos que el panel le muestra al
// admin (enums y textos libres de la base). Un solo lugar para que el filtro,
// las listas, la ficha y la auditoría digan siempre la misma palabra.

// Estados que hoy puede tomar un pago en el ledger. `estado` es texto libre en
// la base (`pagos.estado`), pero estos son los valores reales que escribe el
// webhook (VGRP-23).
export const ESTADOS = [
  "approved",
  "pending",
  "in_process",
  "rejected",
  "refunded",
  "cancelled",
] as const;

export const ESTADO_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
} satisfies Record<(typeof ESTADOS)[number], string>;

/** Label legible de un estado; si llega uno desconocido, se muestra tal cual. */
export function estadoLabel(estado: string): string {
  return ESTADO_LABELS[estado] ?? estado;
}

export const NIVELES = Constants.public.Enums.nivel_acceso;

export const NIVEL_LABELS: Record<NivelAcceso, string> = {
  completo: "Acceso completo",
  ninguno: "Sin acceso",
};

export function nivelLabel(nivel: string): string {
  return NIVEL_LABELS[nivel as NivelAcceso] ?? nivel;
}

export const ROLES = Constants.public.Enums.rol_usuario;

export const ROL_LABELS: Record<(typeof ROLES)[number], string> = {
  user: "Usuario",
  admin: "Admin",
};

export function rolLabel(rol: string): string {
  return ROL_LABELS[rol as (typeof ROLES)[number]] ?? rol;
}

// `mostrarRef: false` cuando la referencia no le dice nada al admin (las filas
// del seed local tienen una inventada).
const PROVEEDORES: Record<string, { label: string; mostrarRef: boolean }> = {
  mercadopago: { label: "Mercado Pago", mostrarRef: true },
  transferencia: { label: "Transferencia", mostrarRef: true },
  seed: { label: "Pago de prueba", mostrarRef: false },
};

/** "Mercado Pago · operación 123…", o sólo el nombre si la ref no aporta. */
export function origenPago(p: { proveedor: string; proveedor_ref: string }): string {
  const { label, mostrarRef } = PROVEEDORES[p.proveedor] ?? {
    label: p.proveedor,
    mostrarRef: true,
  };
  return mostrarRef ? `${label} · operación ${p.proveedor_ref}` : label;
}
