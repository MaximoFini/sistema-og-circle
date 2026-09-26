import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./tokens.css";

// Tipografía del sistema (DESIGN.md → "Sistema de ESTE repo"): una sola
// familia, Inter variable con eje de tamaño óptico (`opsz` 14–32). Con
// `font-optical-sizing: auto` el navegador elige el diseño óptico según el
// tamaño — texto chico más abierto, títulos más ajustados —, el mismo
// principio que SF Pro Text/Display. `next/font`, auto-hospedada, sin <link>
// a terceros (docs/RENDIMIENTO.md, regla 6).
//
// La landing usa Helvetica Now Var, pero es una fuente comercial de Monotype
// sin licencia verificada para este producto: no se embebe hasta confirmarla.
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "OG Circle",
  description: "OG Circle — plataforma.",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
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
