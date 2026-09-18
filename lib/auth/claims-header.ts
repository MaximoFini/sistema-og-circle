// VGRP-54 punto 2 — nombre y (de)codificación del header que `middleware.ts`
// usa para propagar a la misma request los claims que YA verificó con
// `getClaims()`, para que `getVerifiedClaims()` (lib/auth/server.ts) no tenga
// que volver a verificar el JWT en cada handler.
//
// Puro (sin `next/headers`, sin `cookies()`, sin I/O): así se puede importar
// tanto desde `middleware.ts` (Edge runtime, no tiene el contexto de request
// de Server Components) como desde `lib/auth/server.ts` (contexto de
// request). `btoa`/`atob` son las únicas APIs que usa — están disponibles en
// ambos runtimes sin import.
//
// REGLA DURA: quien LEE este header (`getVerifiedClaims()`) sólo puede
// confiar en el valor que puso el middleware para ESTA request — nunca en uno
// que haya llegado del cliente. Por eso `middleware.ts` borra este header de
// la request ENTRANTE antes de decidir si lo vuelve a poner con el valor
// verificado: sin ese borrado, cualquiera podría mandar el header a mano y
// saltarse la verificación real.

import type { AppMetadataClaims } from "./claims";

export const CLAIMS_HEADER = "x-vgrp-verified-claims";

export function encodeClaims(claims: AppMetadataClaims): string {
  return btoa(JSON.stringify(claims));
}

/** `null` tanto si el header no vino como si vino corrupto — en los dos casos
 * el caller (`getVerifiedClaims()`) tiene que caer a la verificación
 * completa, nunca asumir una sesión a partir de un valor que no pudo leer. */
export function decodeClaims(raw: string): AppMetadataClaims | null {
  try {
    return JSON.parse(atob(raw)) as AppMetadataClaims;
  } catch {
    return null;
  }
}
