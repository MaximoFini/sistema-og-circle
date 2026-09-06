import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./tokens.css";

export const metadata: Metadata = {
  title: "OG Circle",
  description: "OG Circle — plataforma.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        {/* VGRP-41 — Speed Insights y Analytics de Vercel. No necesitan env
            var ni configuración: sólo recolectan datos cuando el deploy
            corre en la infraestructura de Vercel, y no hacen nada (sin
            romper ni loguear) en desarrollo local o en otro hosting. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
