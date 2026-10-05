// =============================================================================
// VGRP-76 — origen del registro: de qué botón de la landing vino el usuario.
//
// Módulo puro (sin I/O, sin `next/*`): lo importa `middleware.ts` (Edge) para
// normalizar `?origen=` antes de guardarlo en la cookie, y el panel de admin
// para las etiquetas. La escritura en la base vive en `origen-server.ts`, que
// sí arrastra el cliente service-role y no tiene que llegar al middleware.
// =============================================================================

/** Misma lista que el `check` de `profiles.origen_registro` (migración
 *  20261005010000). Si se suma un CTA, se cambian los dos lugares juntos. */
export const ORIGENES = [
  "landing-nav",
  "landing-hero",
  "landing-menu-mobile",
  "landing-precios-principiante",
  "landing-precios-avanzado",
  "directo",
  "otro",
] as const;

export type Origen = (typeof ORIGENES)[number];

/** Cookie first-party donde se guarda el origen entre `/registro?origen=…` y
 *  la creación de la cuenta (que con Google pasa varias redirecciones después). */
export const ORIGEN_COOKIE = "og_origen";

export const ORIGEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function esOrigen(valor: string): valor is Origen {
  return (ORIGENES as readonly string[]).includes(valor);
}

/**
 * Lo vacío (sin `?origen`, sin cookie) es `directo`; cualquier valor que no
 * esté en la lista cerrada es `otro`. Nunca se guarda texto libre que venga
 * de la URL.
 */
export function normalizarOrigen(valor: string | null | undefined): Origen {
  const limpio = valor?.trim();
  if (!limpio) return "directo";
  return esOrigen(limpio) ? limpio : "otro";
}
