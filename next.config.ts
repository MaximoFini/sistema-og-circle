import withBundleAnalyzer from "@next/bundle-analyzer";
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

  // VGRP-56 punto 7 — avif primero (más chico que webp a igual calidad en la
  // mayoría de fotos/thumbnails), webp como fallback para navegadores sin
  // soporte avif. Afecta al pipeline de optimización de next/image, no a los
  // <img> nativos de components/video (esos son thumbnails externos de
  // YouTube, fuera del alcance de este optimizador).
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // VGRP-56 punto 7 — `experimental.optimizePackageImports` para
  // @sentry/nextjs y zod se probó y se descartó (no movió el First Load JS):
  // detalle y números en docs/RENDIMIENTO.md.

  // VGRP-55 punto 7 — cero headers de cache en todo el repo (grep de
  // Cache-Control/s-maxage/stale-while-revalidate: sin resultados). Next ya
  // se ocupa de /_next/static; `public/` no.
  async headers() {
    return [
      {
        // Los assets de public/ se sirven en la RAÍZ de la URL (no bajo
        // /public) — matchea por extensión, no por carpeta, para cubrir
        // cualquier archivo nuevo sin volver a tocar esto.
        source: "/:path*.(png|jpe?g|svg|ico|webp|woff2?)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Los 4 endpoints del dashboard son por-usuario (gateados por nivel,
        // VGRP-30) y no admiten caché compartida — declararlo explícito es
        // barato y evita que un proxy intermedio decida por su cuenta.
        source: "/api/(agentes|profesionales|servicios-financieros|perfil)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

// VGRP-56 punto 0 — sólo detrás de ANALYZE=true (nunca en un build normal):
// abre el reporte de webpack-bundle-analyzer en el navegador al terminar
// `next build`. Única dependencia nueva de este ticket, en devDependencies.
// Uso: `ANALYZE=true pnpm build`.
const conBundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// VGRP-41 — envuelve el config para que el build suba source maps a Sentry.
// Sin `SENTRY_AUTH_TOKEN` (sólo hace falta en CI/producción, ver
// .env.example) el plugin simplemente no puede autenticar la subida y lo
// resuelve avisando (con `silent: true` ni eso) sin romper el build normal:
// `pnpm build` tiene que funcionar igual en desarrollo local sin esa env var.
export default conBundleAnalyzer(
  withSentryConfig(nextConfig, {
    silent: true,
    webpack: {
      treeshake: { removeDebugLogging: true },
    },
    // `org`/`project` se pueden fijar acá cuando exista la cuenta real de
    // Sentry (docs/OBSERVABILIDAD.md); mientras tanto se leen de
    // SENTRY_ORG / SENTRY_PROJECT si alguna vez se setean.
    widenClientFileUpload: false,
  }),
);
