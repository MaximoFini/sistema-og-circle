import * as Sentry from "@sentry/nextjs";
import { getEnv } from "./env";

/**
 * URL pública del sitio (`NEXT_PUBLIC_SITE_URL`), compartida por checkout de
 * Mercado Pago, emails transaccionales y el link de confirmación de Supabase.
 *
 * Movida desde `lib/mercadopago/preferencia.ts` (VGRP-26) para que no dependa
 * del módulo de pagos; ese archivo la re-exporta para no romper imports.
 *
 * Regla: en producción NUNCA se cae silenciosamente a localhost. Un link de
 * email o un `back_url` de checkout apuntando a localhost es un bug que nadie
 * ve hasta que un usuario real lo clickea, así que ahí se falla fuerte.
 */

const LOCALHOST = "http://localhost:3000";

export function esProduccion(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Versión estricta: en `VERCEL_ENV === "production"` lanza si falta
 * `NEXT_PUBLIC_SITE_URL` (y lo reporta a Sentry). Fuera de producción, cae a
 * localhost como `getSiteUrl()`.
 */
export function getSiteUrlProduccion(): string {
  try {
    return getEnv("NEXT_PUBLIC_SITE_URL");
  } catch (error) {
    if (esProduccion()) {
      const mensaje =
        "NEXT_PUBLIC_SITE_URL no está configurada en producción: no se pueden armar links absolutos.";
      console.error(`[site-url] ${mensaje}`);
      Sentry.captureException(error, { extra: { detalle: mensaje } });
      throw new Error(mensaje);
    }
    return LOCALHOST;
  }
}

/**
 * `NEXT_PUBLIC_SITE_URL` con default de desarrollo (`localhost:3000`). En
 * producción delega en `getSiteUrlProduccion()`, así que una env var faltante
 * ahí falla en vez de devolver localhost.
 */
export function getSiteUrl(): string {
  if (esProduccion()) return getSiteUrlProduccion();
  try {
    return getEnv("NEXT_PUBLIC_SITE_URL");
  } catch {
    return LOCALHOST;
  }
}
