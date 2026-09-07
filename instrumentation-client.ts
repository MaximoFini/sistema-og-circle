// VGRP-41 — Observabilidad: inicialización de Sentry en el cliente.
//
// Next.js 15 carga este archivo automáticamente antes de que la app hidrate
// en el browser (reemplaza al viejo `sentry.client.config.ts`). Corre en
// TODO Client Component, por ejemplo `PendienteClient.tsx`
// (app/(app)/comprar/pendiente).
//
// FAIL-OPEN, igual que instrumentation.ts: sin `NEXT_PUBLIC_SENTRY_DSN` esto
// no inicializa nada — nada de warnings en consola del browser, la app
// funciona exactamente igual.
//
// `environment: NEXT_PUBLIC_APP_ENV || "local"` — mismo fix que
// instrumentation.ts (VGRP-48): sin esto, Sentry infiere el ambiente y un
// build corrido a mano o por Playwright localmente queda etiquetado
// `production`, indistinguible de un deploy real.
//
// `NEXT_PUBLIC_APP_ENV` (no `NEXT_PUBLIC_VERCEL_ENV` directo) — definida en
// `next.config.ts` a partir de `VERCEL_ENV`, a propósito: `VERCEL_ENV` sin
// prefijo público sólo llega al bundle del browser si el toggle
// "Automatically expose System Environment Variables" está prendido en el
// proyecto de Vercel, algo que no se puede verificar desde el código. Con el
// `env` de `next.config.ts`, el valor se inlinea en build time sin depender
// de ese toggle.
//
// Referenciada literal (no vía `getEnv()`/acceso dinámico): Next sólo puede
// inlinear en el bundle del browser una referencia `process.env.NEXT_PUBLIC_ALGO`
// escrita tal cual — ver el bug real que este mismo motivo causó en
// `lib/auth/browser.ts`.
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV || "local",
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
