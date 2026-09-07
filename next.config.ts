import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // VGRP-48 — expone el ambiente real de Vercel al bundle del cliente SIN
  // depender de que "Automatically expose System Environment Variables"
  // esté prendido en el proyecto de Vercel (ese toggle es lo único que
  // controla si `NEXT_PUBLIC_VERCEL_ENV` llega sola al browser; `VERCEL_ENV`
  // — sin el prefijo público — sí está SIEMPRE disponible en build time en
  // cualquier deploy de Vercel, sin ningún toggle). `env` de Next.js
  // reemplaza esto por un literal en build time, tanto en server como en
  // client — mismo mecanismo, sin el intermediario que podría estar
  // apagado. Usado por `instrumentation-client.ts` para que
  // `environment` de Sentry nunca dependa de una config externa que no se
  // puede verificar desde el código.
  env: {
    NEXT_PUBLIC_APP_ENV: process.env.VERCEL_ENV ?? "local",
  },
};

// VGRP-41 — envuelve el config para que el build suba source maps a Sentry.
// Sin `SENTRY_AUTH_TOKEN` (sólo hace falta en CI/producción, ver
// .env.example) el plugin simplemente no puede autenticar la subida y lo
// resuelve avisando (con `silent: true` ni eso) sin romper el build normal:
// `pnpm build` tiene que funcionar igual en desarrollo local sin esa env var.
export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
  // `org`/`project` se pueden fijar acá cuando exista la cuenta real de
  // Sentry (docs/OBSERVABILIDAD.md); mientras tanto se leen de
  // SENTRY_ORG / SENTRY_PROJECT si alguna vez se setean.
  widenClientFileUpload: false,
});
