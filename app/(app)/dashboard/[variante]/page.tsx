import { notFound } from "next/navigation";
import { InicioBloqueado } from "@/components/inicio/InicioBloqueado";
import { InicioShell } from "@/components/inicio/InicioShell";
import { isNivelAcceso, NIVELES } from "@/lib/auth/claims";

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
// reescribir un pedido a `/dashboard`, y quien redirige a quien pide
// `/dashboard/completo` a mano sin plan.
//
// VGRP-77: 'ninguno' deja de ser una tarjeta vacía de "comprá acceso" y pasa a
// ser el Inicio real, borroso, con la tarjeta de desbloqueo encima
// (`InicioBloqueado`, sin los `embedUrl` de los videos).
// =============================================================================

export function generateStaticParams() {
  return NIVELES.map((variante) => ({ variante }));
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
  if (!isNivelAcceso(variante)) {
    notFound();
  }

  return variante === "ninguno" ? <InicioBloqueado /> : <InicioShell />;
}
