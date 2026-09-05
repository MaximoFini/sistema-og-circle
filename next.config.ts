import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

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
