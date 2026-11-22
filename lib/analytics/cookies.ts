// VGRP-95 (T12) — lectura de las cookies de analytics. Funciones puras, sin
// `server-only`: reciben el valor crudo de la cookie y devuelven `null` ante
// ausente o corrupto, nunca tiran.

/** Nombre de la cookie que marca tráfico interno (se setea en `.ogcircle.com.ar`). */
export const INTERNO_COOKIE = "og_interno";

/** Nombre de la cookie de PostHog para una project key dada. */
export function nombreCookiePostHog(key: string): string {
  return `ph_${key}_posthog`;
}

/**
 * `distinct_id` anónimo de la landing, a partir del valor de la cookie
 * `ph_<key>_posthog` (JSON, normalmente url-encoded). `null` si falta, no es
 * JSON o no trae un `distinct_id` string no vacío.
 */
export function leerDistinctId(valor: string | null | undefined): string | null {
  if (!valor) return null;
  let texto = valor;
  try {
    texto = decodeURIComponent(valor);
  } catch {
    // valor con % suelto: se intenta tal cual
  }
  try {
    const parsed: unknown = JSON.parse(texto);
    if (typeof parsed !== "object" || parsed === null) return null;
    const id = (parsed as { distinct_id?: unknown }).distinct_id;
    return typeof id === "string" && id.trim() !== "" ? id : null;
  } catch {
    return null;
  }
}

/** Cualquier otro valor (incluido "0" o "true") cuenta como NO interno. */
export function esInternoCookie(valor: string | null | undefined): boolean {
  return valor === "1";
}
