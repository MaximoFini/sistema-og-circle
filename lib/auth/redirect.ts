// =============================================================================
// VGRP-18/19 — validación del destino de redirect post-login.
//
// El middleware guarda el path original en `?next=` para devolver al usuario
// a donde iba. Ese valor viene de la URL, o sea del atacante: si se usa tal
// cual en un `redirect()`, el login se vuelve un trampolín de phishing
// (`/login?next=https://evil.com` → el usuario ve nuestro dominio en el mail,
// se loguea, y termina en el sitio del atacante ya "confiando" en el flujo).
// Es la vulnerabilidad clásica de open redirect.
//
// Módulo puro a propósito (sin I/O, sin `next/*`): se puede testear en Node
// plano, y lo pueden importar tanto Server Components como Client Components.
//
// ESTADO: `middleware.ts` ya ESCRIBE `?next=`, pero todavía no hay nadie que
// lo LEA — la pantalla de login real es VGRP-18. Este helper se entrega antes
// justamente para que ese ticket no tenga que inventar la validación:
// quien implemente el login debe hacer
// `safeRedirectPath(searchParams.get("next"))`, NUNCA usar `next` crudo. El
// middleware no sanea nada; sólo copia el path original.
// =============================================================================

/** Destino por defecto cuando no hay `next`, o cuando el que vino no es seguro. */
export const DEFAULT_REDIRECT = "/dashboard";

// Cualquier cosa con esquema (`http:`, `https:`, `javascript:`, `data:`...)
// sale de nuestro origen o ejecuta código. Se rechaza de plano.
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// Los browsers descartan espacios y caracteres de control al parsear una URL:
// un tab entre las barras hace que "/<tab>/evil.com" termine siendo
// "//evil.com", que es protocol-relative. Por eso no se limpia ni se
// normaliza nada: se rechaza la cadena entera. Se detecta con un scan y no
// con un rango de regex para no meter caracteres de control en el fuente.
//
// ALCANCE: mira la cadena CRUDA. Un `%09` percent-encoded no se detecta acá
// (y no hace falta: `%09` no se decodifica solo al navegar). Si algún caller
// hace `decodeURIComponent()` sobre `next`, tiene que pasar el resultado por
// `safeRedirectPath()` DESPUÉS de decodificar, no antes.
function hasControlOrSpace(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Devuelve un destino de redirect seguro a partir de un valor no confiable
 * (típicamente `searchParams.get("next")`).
 *
 * Sólo se acepta un **path relativo a nuestro propio origen**:
 * - empieza con `/`
 * - NO empieza con `//` ni con `/` + backslash: ambos son protocol-relative
 *   y navegan a OTRO host, no a un path nuestro
 * - no declara un esquema (`https:`, `javascript:`...)
 * - no trae espacios ni caracteres de control
 *
 * Todo lo que no pase cae al default seguro. Nunca lanza.
 */
export function safeRedirectPath(
  target: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof target !== "string" || target === "") return fallback;
  if (hasControlOrSpace(target)) return fallback;
  if (SCHEME.test(target)) return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;
  return target;
}
