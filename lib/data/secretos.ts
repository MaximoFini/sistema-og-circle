import "server-only";

// VGRP-30 — única forma correcta de exponer un secreto (contacto de agente,
// provider_ref de video, dato SWIFT) a lo que sea que lo consuma después.
// `server-only`: si algún día un 'use client' importa esto por error, el
// build falla en vez de publicar el producto — STACK.md §3, regla dura.
//
// VGRP-59/60 (Bloque 13 — plan único): ya no hay un "nivel mínimo" que
// elegir por fila — con un solo plan, la pregunta es sólo "¿tiene acceso o
// no?" (`tieneAcceso()`, lib/auth/claims.ts).

import type { AppMetadataClaims } from "@/lib/auth/claims";
import { tieneAcceso } from "@/lib/auth/claims";

/**
 * Devuelve `secreto` sólo si `claims` tiene el plan completo
 * (`tieneAcceso()`, VGRP-60); si no, `null`. No hace el fetch del secreto —
 * quien llama decide cuándo vale la pena pagar esa consulta real; esto es la
 * ÚLTIMA barrera antes de serializar la respuesta, no la única optimización.
 *
 * REGLA DURA: llamar esto con el `claims` de una sesión REAL, verificada en
 * el momento del request (`getVerifiedClaims()`) — nunca con un nivel que
 * venga de un segmento de URL o de un prop heredado de una página estática.
 * Las dos variantes de `app/(app)/dashboard/[variante]/` son prerenderizadas
 * (el mismo HTML para cualquiera que las pida): un secreto embebido ahí se
 * filtraría a cualquier usuario logueado que escriba esa URL a mano, sea
 * cual sea su nivel real. Por eso `resolverSecreto()` se llama siempre desde
 * un contexto dinámico (Route Handler), nunca desde el render de esa ruta.
 */
export function resolverSecreto<T>(claims: AppMetadataClaims | null, secreto: T): T | null {
  return tieneAcceso(claims) ? secreto : null;
}
