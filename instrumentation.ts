// VGRP-41 — Observabilidad: inicialización de Sentry en runtime de servidor.
//
// Next.js 15 (App Router) llama a `register()` una vez al levantar el
// server, tanto en runtime Node como en Edge — `NEXT_RUNTIME` indica cuál de
// los dos está corriendo. Éste es el patrón moderno de `@sentry/nextjs` que
// reemplazó a los viejos `sentry.server.config.ts` / `sentry.edge.config.ts`.
//
// FAIL-OPEN A PROPÓSITO: todavía no existe una cuenta de Sentry real ni un
// DSN (mismo tipo de bloqueante externo que ya se resolvió para Mercado Pago
// y Vercel — ver docs/OBSERVABILIDAD.md). Si `SENTRY_DSN` no está seteada,
// esta función no hace absolutamente nada: no lanza, no loguea un warning en
// cada arranque, simplemente no instrumenta. La app tiene que arrancar y
// funcionar exactamente igual que hoy sin esta env var.
export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      // Nunca mandar PII por default: este proyecto maneja datos de pago
      // (Mercado Pago) y tokens de sesión (Supabase Auth). Sentry no debe
      // recibir cookies, headers de auth, ni IPs/emails de los usuarios sin
      // una decisión explícita del equipo — que todavía no existe.
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  }
}

// Captura errores de rendering de Server Components que Next.js expone vía
// este hook (`onRequestError`), disponible desde Next 15. Mismo criterio
// fail-open: sin DSN, `register()` nunca corrió `Sentry.init`, así que acá
// no hay nada que mandar — pero igual se guarda detrás del mismo chequeo
// para no importar el SDK al pedo cuando no hace falta.
export async function onRequestError(...args: unknown[]): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    return;
  }
  const Sentry = await import("@sentry/nextjs");
  const [error, request, errorContext] = args as Parameters<typeof Sentry.captureRequestError>;
  Sentry.captureRequestError(error, request, errorContext);
}
