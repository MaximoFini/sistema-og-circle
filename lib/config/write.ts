import "server-only";

// =============================================================================
// VGRP-40 — Escritura de Edge Config vía la API REST de Vercel.
//
// Hermano de `lib/config/index.ts` (que sigue siendo SOLO lectura — el paquete
// `@vercel/edge-config` es read-only por diseño de Vercel). Este módulo es el
// único lugar del repo que escribe en el store `sistema-og-circle`.
//
// Nunca propaga una excepción cruda ni el detalle de la respuesta de Vercel al
// caller "feliz" — devuelve `EdgeConfigWriteResult` (ver design.md
// specs/bloque-10-pendientes/design-vgrp40.md §Interfaces). El caller decide
// qué hacer con el error (mensaje genérico al cliente, detalle a Sentry).
// =============================================================================

export type EdgeConfigWriteResult = { ok: true } | { ok: false; status: number; message: string };

export interface EdgeConfigWriteItem {
  key: "precios" | "flags";
  value: unknown;
}

/**
 * Escribe una o más claves top-level de Edge Config en una sola request. La
 * API de Vercel aplica todos los `items` de un mismo PATCH de forma atómica
 * (todo o nada) — no hace falta lógica propia de rollback acá.
 *
 * Requiere `VERCEL_EDGE_CONFIG_ID` y `VERCEL_EDGE_CONFIG_WRITE_TOKEN` en el
 * entorno (ver .env.example). Sin alguno de los dos, devuelve `{ ok: false }`
 * en vez de intentar la request — mismo criterio fail-safe que
 * `lib/config/index.ts::readKey()`.
 */
export async function escribirEdgeConfig(
  items: EdgeConfigWriteItem[],
): Promise<EdgeConfigWriteResult> {
  const edgeConfigId = process.env.VERCEL_EDGE_CONFIG_ID;
  const token = process.env.VERCEL_EDGE_CONFIG_WRITE_TOKEN;
  if (!edgeConfigId || !token) {
    return {
      ok: false,
      status: 0,
      message: "VERCEL_EDGE_CONFIG_ID o VERCEL_EDGE_CONFIG_WRITE_TOKEN no están configurados.",
    };
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  const url = new URL(`https://api.vercel.com/v1/edge-config/${edgeConfigId}/items`);
  if (teamId) url.searchParams.set("teamId", teamId);

  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        items: items.map((i) => ({ operation: "update", key: i.key, value: i.value })),
      }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: detalle || res.statusText };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Error de red desconocido.",
    };
  }
}
