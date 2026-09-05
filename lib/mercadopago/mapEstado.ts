/**
 * Mapeo del `status` de la API de pagos de Mercado Pago al `estado` interno
 * que entiende `nivel_vigente()` (VGRP-23).
 *
 * `pagos.estado` es `text` libre en la base, pero la función SQL
 * `nivel_vigente()` sólo le da efecto sobre el nivel a `'approved'` y
 * `'refunded'` — todo lo demás es informativo. Este mapeo es la única fuente
 * de verdad de esa correspondencia; ver
 * `supabase/migrations/20260905023031_nivel_vigente_precedencia.sql`.
 */

export type EstadoInterno = "approved" | "pending" | "rejected" | "refunded";

const MAPA_STATUS_A_ESTADO: Record<string, EstadoInterno> = {
  approved: "approved",
  pending: "pending",
  in_process: "pending",
  authorized: "pending",
  rejected: "rejected",
  cancelled: "rejected",
  refunded: "refunded",
  charged_back: "refunded",
};

/**
 * Traduce el `status` de un pago de MP a nuestro `estado` interno.
 *
 * Devuelve `null` ante cualquier `status` no contemplado en la tabla de
 * arriba: es mejor no escribir un estado que no sabemos interpretar que
 * inventar uno — el caller (el webhook) loguea y responde 200 sin insertar
 * nada en ese caso.
 */
export function mapearEstadoMercadoPago(status: string): EstadoInterno | null {
  return MAPA_STATUS_A_ESTADO[status] ?? null;
}
