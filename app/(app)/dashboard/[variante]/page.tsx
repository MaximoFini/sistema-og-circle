import { notFound } from "next/navigation";
import { InicioShell } from "@/components/inicio/InicioShell";

// =============================================================================
// VGRP-27 — Inicio para nivel 'principiante' | 'avanzado', 100% prerenderizado.
//
// Cero `cookies()` / `getVerifiedClaims()` en este archivo a propósito: el
// nivel llega por el `params` de la URL interna, no por sesión. Es lo que
// mantiene esta ruta estática (sale del CDN, PRD §3.5) — `middleware.ts` es
// quien decide, leyendo el claim SIN pegarle a la base, a cuál de las dos
// reescribir un pedido a `/dashboard`.
//
// IMPORTANTE (design.md, "Open questions / risks" #1): que esta ruta exista
// en `/dashboard/avanzado` NO es, por sí sola, un mecanismo de seguridad —
// hoy el contenido es idéntico entre variantes (placeholders). La garantía
// real de "un Principiante no ve contenido de Avanzado" la construye VGRP-30
// dentro de cada sección, no la elección de variante acá.
// =============================================================================

const VARIANTES = ["principiante", "avanzado"] as const;
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

  return <InicioShell variante={variante} />;
}
