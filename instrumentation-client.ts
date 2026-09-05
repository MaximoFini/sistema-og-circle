// VGRP-41 — Observabilidad: inicialización de Sentry en el cliente.
//
// Next.js 15 carga este archivo automáticamente antes de que la app hidrate
// en el browser (reemplaza al viejo `sentry.client.config.ts`). Corre en
// TODO Client Component, por ejemplo `PendienteClient.tsx`
// (app/(app)/comprar/pendiente).
//
// FAIL-OPEN A PROPÓSITO, igual que instrumentation.ts: sin
// `NEXT_PUBLIC_SENTRY_DSN` (todavía no existe cuenta de Sentry real, ver
// docs/OBSERVABILIDAD.md) esto no inicializa nada — nada de warnings en
// consola del browser, la app funciona exactamente igual que hoy.
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Nunca mandar PII por default (ver el mismo comentario en
    // instrumentation.ts): este proyecto maneja datos de pago y sesión.
    sendDefaultPii: false,
  });
}

// Next.js 15 usa este hook para instrumentar la navegación entre rutas
// (App Router). Fail-open: si Sentry nunca se inicializó arriba, exportar
// esto no tiene efecto (el propio SDK lo no-opea sin `init` previo).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
