// VGRP-95 (T12) — PostHog del lado del servidor.
//
// Contrato: NUNCA rechazan. Cualquier error se manda a Sentry y se traga, y sin
// `NEXT_PUBLIC_POSTHOG_KEY` no hacen nada. Por eso un fallo de analytics no
// puede romper un registro ni responderle error al webhook de Mercado Pago.
// Se usan los métodos `*Immediate` (envían ya, sin cola): en serverless la
// función puede congelarse apenas responde. Cada llamada va con timeout corto.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://us.i.posthog.com";
const TIMEOUT_MS = 3000;

function crearCliente(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  return new PostHog(key, {
    host: POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: TIMEOUT_MS,
    fetchRetryCount: 0,
  });
}

/** Resuelve cuando termina `promesa` o vencen `ms`, lo que pase primero, sin dejar el timer vivo. */
function conTimeout(promesa: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
}

async function ejecutar(etiqueta: string, fn: (cliente: PostHog) => Promise<void>): Promise<void> {
  try {
    const cliente = crearCliente();
    if (!cliente) return;
    await conTimeout(fn(cliente), TIMEOUT_MS + 500);
  } catch (error) {
    try {
      Sentry.captureException(error, { tags: { analytics: etiqueta } });
    } catch {
      // ni Sentry puede romper el flujo
    }
  }
}

/** Manda un evento desde el servidor. `distinctId`: user.id o el anónimo de la landing. */
export async function capturarServidor(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  await ejecutar("capturar", (c) => c.captureImmediate({ distinctId, event, properties }));
}

/** Une el visitante anónimo de la landing con el usuario recién registrado. */
export async function unirVisitante(distinctIdAnonimo: string, userId: string): Promise<void> {
  if (!distinctIdAnonimo || distinctIdAnonimo === userId) return;
  await ejecutar("unir", (c) => c.aliasImmediate({ distinctId: userId, alias: distinctIdAnonimo }));
}

/** Lo excluye de las métricas del admin (las filtra por `es_interno`). */
export async function marcarInterno(userId: string): Promise<void> {
  await ejecutar("interno", (c) =>
    c.identifyImmediate({ distinctId: userId, properties: { es_interno: true } }),
  );
}
