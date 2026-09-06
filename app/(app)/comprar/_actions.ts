"use server";

// VGRP-22 — Server Actions del checkout de Mercado Pago.
//
// Las dos acciones de acá abajo son las únicas que este ticket agrega. No
// tocan `lib/data/` ni ninguna tabla directamente (eso es VGRP-24a, en
// paralelo) — sólo leen precios/claims y hablan con la API de Mercado Pago.

import { track } from "@vercel/analytics/server";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import type { NivelAcceso } from "@/lib/database.types";
import { getPreferenceClient } from "@/lib/mercadopago/client";
import { armarPreferencia, type NivelComprable } from "@/lib/mercadopago/preferencia";

export type CrearCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

function esNivelComprable(nivel: NivelAcceso): nivel is NivelComprable {
  return nivel !== "ninguno";
}

/**
 * Crea la preferencia de Checkout Pro para `nivel` y devuelve la URL de
 * redirect al checkout.
 *
 * Por qué devuelve `{ ok, url }` al caller en vez de hacer `redirect()` acá
 * mismo: `redirect()` de Next funciona lanzando una excepción especial
 * (`NEXT_REDIRECT`) que el framework intercepta — mezclar eso con el
 * discriminated union de errores de abajo (sesión ausente, nivel inválido,
 * fallo de red/API de MP) obligaría al caller a distinguir "una excepción
 * de verdad" de "una excepción que en realidad es un success". Es más simple
 * que este Server Action nunca lance a propósito (ni siquiera vía
 * `redirect()`) y que sea el Client Component que lo invoca quien decida
 * navegar con `router.push(url)` al ver `ok: true` — ver
 * `app/(app)/comprar/ComprarButton.tsx`.
 */
export async function crearCheckout(nivel: NivelAcceso): Promise<CrearCheckoutResult> {
  // Server Actions son endpoints HTTP propios: el middleware los cubre (no
  // están en `PUBLIC_EXACT`), pero CLAUDE.md es explícito en que eso no
  // alcanza — se puede invocar un Server Action directo, sin pasar por el
  // render de ninguna página. Chequeo explícito, no delegado al middleware.
  const claims = await getVerifiedClaims();
  if (!claims) {
    return { ok: false, error: "Tenés que iniciar sesión para comprar un nivel." };
  }

  if (!esNivelComprable(nivel)) {
    return { ok: false, error: "Ese nivel no está disponible para compra." };
  }

  // `AppMetadataClaims` (lib/auth/claims.ts) sólo tipa `app_metadata` — el
  // resto de los claims del JWT quedan bajo su índice `[key: string]: unknown`
  // a propósito (ver el comentario de esa interfaz), así que `sub` (el user
  // id, claim estándar de cualquier JWT de Supabase Auth) llega acá como
  // `unknown`. Se valida explícitamente en vez de castear a ciegas: si
  // alguna vez faltara (no debería, es un claim requerido de Supabase), la
  // preferencia no puede armarse sin un `external_reference` real.
  const userId = claims.sub;
  if (typeof userId !== "string" || !userId) {
    return { ok: false, error: "No pudimos identificar tu usuario. Volvé a iniciar sesión." };
  }

  const preferencia = await armarPreferencia(nivel, userId);
  if (!preferencia.ok) {
    // Mismo error que ya viene de `getPrecios()` (fail-closed): no se
    // inventa un mensaje distinto, se lo pasa tal cual para que quien
    // audite un incidente vea la causa real (Edge Config caído, schema
    // inválido, etc.) y no un genérico que la esconda.
    return { ok: false, error: preferencia.error };
  }

  let response: Awaited<ReturnType<ReturnType<typeof getPreferenceClient>["create"]>>;
  try {
    response = await getPreferenceClient().create({ body: preferencia.preferenceData });
  } catch (error) {
    // Nunca dejar escapar una excepción no controlada al caller (fetch
    // caído, timeout, credenciales inválidas, 4xx/5xx de la API de MP). El
    // detalle real queda en el log del server; al usuario se le muestra un
    // mensaje genérico y accionable (ver comprar.module.css / page.tsx).
    console.error("[mercadopago] fallo al crear la preferencia:", error);
    return {
      ok: false,
      error: "No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en un momento.",
    };
  }

  // `init_point` vs `sandbox_init_point`: el SDK/la API de Mercado Pago
  // devuelve el campo que corresponde según el TIPO de credencial que
  // autenticó la request (`MERCADOPAGO_ACCESS_TOKEN`), no algo que el
  // integrador tenga que decidir a mano — con un access token de cuenta de
  // TEST (el que usa este repo hoy, ver .env.example), `init_point` YA
  // apunta al checkout de sandbox; `sandbox_init_point` es el campo legado
  // que documentaba el SDK viejo (`mercadopago` v1/v2) para el mismo caso.
  // Se prioriza `init_point` con fallback a `sandbox_init_point` sólo por
  // robustez ante una respuesta atípica de la API, nunca como una rama de
  // lógica "si es test, usar sandbox_init_point" — eso ya lo resuelve el
  // token, no este código.
  const url = response.init_point ?? response.sandbox_init_point;
  if (!url) {
    console.error("[mercadopago] la preferencia se creó sin init_point ni sandbox_init_point");
    return {
      ok: false,
      error: "No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en un momento.",
    };
  }

  // VGRP-41 — evento de conversión por nivel (PRD: cuántos inician checkout
  // vs. cuántos terminan pagando). Nunca debe poder tirar abajo el flujo de
  // creación del checkout: mismo criterio de "no bloquear lo importante"
  // que `notificarPagoAprobado` en el webhook.
  try {
    await track("checkout_iniciado", { nivel });
  } catch (error) {
    console.error("[mercadopago] track('checkout_iniciado') falló:", error);
  }

  return { ok: true, url };
}

/**
 * Usado por la pantalla de espera (`/comprar/pendiente`) para el polling de
 * VGRP-22: lee `getNivel()` de los claims YA verificados de la request
 * actual.
 *
 * OJO — esto por sí solo NO detecta un pago recién confirmado: los claims
 * vienen de la cookie de sesión vigente, que no se actualiza sola. Por eso
 * el Client Component que llama a esto (`PendienteClient.tsx`) primero
 * refresca la sesión en el browser (`supabase.auth.refreshSession()`, con
 * el cliente de `lib/auth/browser.ts`) en cada tick de polling, ANTES de
 * pedirle a este Server Action que vuelva a leer los claims. Sin ese
 * refresh previo, este Server Action seguiría viendo la cookie vieja y
 * jamás vería 'ninguno' cambiar aunque el webhook (VGRP-23) ya haya
 * proyectado el nivel.
 */
export async function consultarNivelActual(): Promise<{ nivel: NivelAcceso }> {
  const claims = await getVerifiedClaims();
  return { nivel: getNivel(claims) };
}
