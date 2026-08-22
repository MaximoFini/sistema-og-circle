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
      <body>{children}</body>
    </html>
  );
}
