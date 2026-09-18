import NextLink from "next/link";
import { notFound } from "next/navigation";
import { InicioShell } from "@/components/inicio/InicioShell";
import buttonStyles from "@/components/ui/Button.module.css";
import dashboardStyles from "../dashboard.module.css";

// =============================================================================
// VGRP-27 — Inicio para nivel 'ninguno' | 'principiante' | 'avanzado', 100%
// prerenderizado (VGRP-54 punto 5 agregó 'ninguno' a las dos que ya había).
//
// Cero `cookies()` / `getVerifiedClaims()` en este archivo a propósito: el
// nivel llega por el `params` de la URL interna, no por sesión. Es lo que
// mantiene esta ruta estática (sale del CDN, PRD §3.5) — `middleware.ts` es
// quien decide, leyendo el claim SIN pegarle a la base, a cuál de las tres
// reescribir un pedido a `/dashboard`.
//
// IMPORTANTE (design.md, "Open questions / risks" #1): que esta ruta exista
// en `/dashboard/avanzado` NO es, por sí sola, un mecanismo de seguridad —
// hoy el contenido es idéntico entre variantes (placeholders). La garantía
// real de "un Principiante no ve contenido de Avanzado" la construye VGRP-30
// dentro de cada sección, no la elección de variante acá.
//
// El contenido de 'ninguno' es el mismo CTA de "comprar acceso" que tenía
// `app/(app)/dashboard/page.tsx` para ese nivel — copiado tal cual (mismas
// clases, mismo copy), no rediseñado. Esa página bare sigue existiendo sin
// tocar, como red de contención si algún request llegara sin pasar por el
// rewrite del middleware.
// =============================================================================

const VARIANTES = ["ninguno", "principiante", "avanzado"] as const;
type Variante = (typeof VARIANTES)[number];

function esVariante(value: string): value is Variante {
  return (VARIANTES as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return VARIANTES.map((variante) => ({ variante }));
}

// Cualquier valor fuera de VARIANTES no es un render dinámico sorpresa: 404.
export const dynamicParams = false;

export default async function InicioPorNivelPage({
  params,
}: {
  params: Promise<{ variante: string }>;
}) {
  const { variante } = await params;
  if (!esVariante(variante)) {
    notFound();
  }

  if (variante === "ninguno") {
    return (
      <div className={dashboardStyles.wrap}>
        <div className={dashboardStyles.card}>
          <p className={dashboardStyles.eyebrow}>Tu cuenta</p>
          <h1 className={dashboardStyles.title}>Todavía no tenés acceso a ningún nivel</h1>
          <p className={dashboardStyles.copy}>
            Comprá un nivel para desbloquear el contenido de la plataforma.
          </p>
          <NextLink href="/comprar" className={`${buttonStyles.button} ${buttonStyles.primary}`}>
            Comprar acceso
          </NextLink>
        </div>
      </div>
    );
  }

  return <InicioShell variante={variante} />;
}
