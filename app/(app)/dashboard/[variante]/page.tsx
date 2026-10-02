import NextLink from "next/link";
import { notFound } from "next/navigation";
import { InicioShell } from "@/components/inicio/InicioShell";
import buttonStyles from "@/components/ui/Button.module.css";
import { Icon } from "@/components/ui/Icon";
import dashboardStyles from "../dashboard.module.css";

// =============================================================================
// VGRP-27 — Inicio para nivel 'ninguno' | 'completo', 100% prerenderizado
// (VGRP-54 punto 5 agregó 'ninguno' a la que ya había).
//
// VGRP-59/60 (Bloque 13 — plan único): esta ruta tenía una tercera variante
// ('principiante') — se borró junto con el nivel intermedio del enum. Lo que
// hoy es 'completo' es, sin cambios de contenido, lo que antes era el caso
// 'avanzado'.
//
// Cero `cookies()` / `getVerifiedClaims()` en este archivo a propósito: el
// nivel llega por el `params` de la URL interna, no por sesión. Es lo que
// mantiene esta ruta estática (sale del CDN, PRD §3.5) — `middleware.ts` es
// quien decide, leyendo el claim SIN pegarle a la base, a cuál de las dos
// reescribir un pedido a `/dashboard`.
//
// El contenido de 'ninguno' es el mismo CTA de "comprar acceso" que tenía
// `app/(app)/dashboard/page.tsx` para ese nivel — copiado tal cual (mismas
// clases, mismo copy), no rediseñado. Esa página bare sigue existiendo sin
// tocar, como red de contención si algún request llegara sin pasar por el
// rewrite del middleware.
// =============================================================================

const VARIANTES = ["ninguno", "completo"] as const;
type Variante = (typeof VARIANTES)[number];

function esVariante(value: string): value is Variante {
  return (VARIANTES as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return VARIANTES.map((variante) => ({ variante }));
}

// Cualquier valor fuera de VARIANTES no es un render dinámico sorpresa: 404.
export const dynamicParams = false;

// VGRP-55 punto 5 — red de contención, no el mecanismo principal de
// actualización (ese sigue siendo revalidateTag, que ya dispara el panel de
// contenido en cada escritura). Sin esto era ISR infinito: si la lectura de
// `videos` fallaba durante `next build` (lib/data/videos.ts, fallback
// fail-open), la grilla de relleno quedaba servida desde el CDN para
// SIEMPRE, hasta que alguien editara un video a mano. Con este piso, como
// mucho una hora.
export const revalidate = 3600;

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
          <span className={dashboardStyles.icono}>
            <Icon name="candado" size={26} />
          </span>
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

  return <InicioShell />;
}
