// VGRP-41 — Observabilidad: inicialización de Sentry en runtime de servidor.
//
// Next.js 15 (App Router) llama a `register()` una vez al levantar el
// server, tanto en runtime Node como en Edge — `NEXT_RUNTIME` indica cuál de
// los dos está corriendo. Éste es el patrón moderno de `@sentry/nextjs` que
// reemplazó a los viejos `sentry.server.config.ts` / `sentry.edge.config.ts`.
//
// FAIL-OPEN cuando no hay DSN: si `SENTRY_DSN` no está seteada, esta función
// no hace absolutamente nada: no lanza, no loguea un warning en cada
// arranque, simplemente no instrumenta. La app tiene que arrancar y
// funcionar exactamente igual sin esta env var.
//
// -----------------------------------------------------------------------------
// `environment` — NUNCA inferido de `NODE_ENV` (bug real, encontrado en VGRP-48)
// -----------------------------------------------------------------------------
// Sin esto, el SDK de Sentry infiere `environment` de `NODE_ENV`. El problema:
// tanto `pnpm build && pnpm start` corrido a mano en una máquina local como
// `playwright.config.ts` (fuerza `NODE_ENV=production` para el server que usa
// el E2E) dejan `NODE_ENV=production` — así que CUALQUIER build o test local
// mandaba sus errores a Sentry etiquetados `environment: production`,
// indistinguibles de un deploy real, y disparaban la Alert Rule de verdad
// (mail al equipo) por simplemente correr la suite de tests en la propia
// compu. `VERCEL_ENV` es la señal correcta: sólo existe en deploys reales de
// Vercel (`production` | `preview` | `development`; ver
// https://vercel.com/docs/environment-variables/system-environment-variables)
// — nunca en una máquina local. Todo lo que corre fuera de un deploy de
// Vercel queda como `"local"`, y las Alert Rules de Sentry se pueden filtrar
// por `environment = production` sin capturar ruido de desarrollo/tests.
function sentryEnvironment(): string {
  return process.env.VERCEL_ENV || "local";
}

export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: sentryEnvironment(),
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
      environment: sentryEnvironment(),
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
