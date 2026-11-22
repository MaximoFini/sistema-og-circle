// VGRP-95 (T13) — Meta Conversions API, sólo servidor.
//
// Manda eventos de conversión (CompleteRegistration, Purchase) a Meta desde el
// servidor. Reglas:
// - Sin `NEXT_PUBLIC_META_PIXEL_ID` o `META_CAPI_TOKEN` es un no-op: la app
//   funciona igual y no sale ningún request.
// - Nunca rechaza: un error de red, un timeout o una respuesta no-2xx se
//   reporta a Sentry y la función resuelve igual. Registrar un usuario o
//   responder el webhook de Mercado Pago no puede depender de Meta.
// - Email y teléfono viajan SÓLO hasheados (SHA-256) y jamás se loguean.

import "server-only";

import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 5000;
const CODIGO_PAIS_AR = "54";

export function hashearSha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

/** Meta pide el email recortado y en minúsculas antes de hashearlo. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sólo dígitos, con código de país. Si el número no empieza con 54 se lo
 * antepone (la plataforma es de Argentina); quita el 0 de troncal local.
 */
export function normalizarTelefono(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "").replace(/^0+/, "");
  if (digitos === "") return "";
  return digitos.startsWith(CODIGO_PAIS_AR) ? digitos : `${CODIGO_PAIS_AR}${digitos}`;
}

export type EventoMeta = {
  eventName: string;
  /** Determinístico (p. ej. `registro_<id>`, `pago_<paymentId>`): deduplica. */
  eventId: string;
  /** Segundos desde epoch. Por defecto, ahora. */
  eventTime?: number;
  email?: string;
  telefono?: string;
  userAgent?: string;
  ip?: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  customData?: Record<string, unknown>;
};

function armarUserData(evento: EventoMeta): Record<string, unknown> {
  const userData: Record<string, unknown> = {};
  const email = evento.email ? normalizarEmail(evento.email) : "";
  if (email) userData.em = [hashearSha256(email)];
  const telefono = evento.telefono ? normalizarTelefono(evento.telefono) : "";
  if (telefono) userData.ph = [hashearSha256(telefono)];
  if (evento.userAgent) userData.client_user_agent = evento.userAgent;
  if (evento.ip) userData.client_ip_address = evento.ip;
  if (evento.fbp) userData.fbp = evento.fbp;
  if (evento.fbc) userData.fbc = evento.fbc;
  return userData;
}

export async function enviarEventoMeta(evento: EventoMeta): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return;

  try {
    const testEventCode = process.env.META_TEST_EVENT_CODE;
    const body = {
      data: [
        {
          event_name: evento.eventName,
          event_id: evento.eventId,
          event_time: evento.eventTime ?? Math.floor(Date.now() / 1000),
          action_source: "website",
          ...(evento.eventSourceUrl ? { event_source_url: evento.eventSourceUrl } : {}),
          user_data: armarUserData(evento),
          ...(evento.customData ? { custom_data: evento.customData } : {}),
        },
      ],
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    };

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) reportar(`Meta CAPI respondió ${res.status}`, evento.eventName);
  } catch (error) {
    const nombre = error instanceof Error ? error.name : "desconocido";
    reportar(`Meta CAPI falló (${nombre})`, evento.eventName);
  }
}

/**
 * A Sentry va sólo un mensaje armado a mano: ni la URL (lleva el token), ni el
 * body (datos hasheados), ni el error original (en un fallo de red podría
 * traer la URL).
 */
function reportar(mensaje: string, evento: string): void {
  Sentry.captureException(new Error(mensaje), { tags: { area: "meta-capi", evento } });
}
