import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FormacionBloqueado } from "@/components/formacion/FormacionBloqueado";
import { FormacionShell } from "@/components/formacion/FormacionShell";
import { isNivelAcceso, NIVELES } from "@/lib/auth/claims";

// =============================================================================
// VGRP-88 — Formación (Stage 1 + Stage 2 + Materiales adicionales), 100%
// prerenderizada, con una variante estática por nivel: igual que
// `/dashboard/[variante]` y `/calculadora/[variante]`.
//
// `middleware.ts` reescribe `/formacion` a `/formacion/ninguno` o
// `/formacion/completo` según el claim de nivel (RUTAS_POR_NIVEL), y redirige a
// quien pide `/formacion/completo` a mano sin plan: esa variante lleva los
// `embedUrl` de los videos, que sin plan no se mandan.
//
// Cero `cookies()` / `getVerifiedClaims()` en este archivo a propósito: el nivel
// llega por el `params` de la URL interna, no por sesión. Es lo que mantiene la
// ruta estática (sale del CDN).
//
// 'ninguno' es la misma pantalla, borrosa e inerte, con la tarjeta de desbloqueo
// encima (`FormacionBloqueado`, sin los `embedUrl` ni acción de descarga).
// =============================================================================

export const metadata: Metadata = { title: "Formación — OG Circle" };

// Cubre TODOS los niveles reales, incluido 'ninguno' (docs/RENDIMIENTO.md, regla 3).
export function generateStaticParams() {
  return NIVELES.map((variante) => ({ variante }));
}

// Cualquier valor fuera de NIVELES no es un render dinámico sorpresa: 404.
export const dynamicParams = false;

// Red de contención, no el mecanismo principal de actualización (ese es
// revalidateTag, que ya dispara el panel de contenido en cada escritura sobre
// `videos` y `materiales`). Sin esto, si la lectura fallara durante `next build`
// (lib/data/videos.ts es fail-open), la pantalla vacía quedaría servida desde el
// CDN para SIEMPRE. Con este piso, como mucho una hora.
export const revalidate = 3600;

export default async function FormacionPorNivelPage({
  params,
}: {
  params: Promise<{ variante: string }>;
}) {
  const { variante } = await params;
  if (!isNivelAcceso(variante)) {
    notFound();
  }

  return variante === "ninguno" ? <FormacionBloqueado /> : <FormacionShell />;
}
