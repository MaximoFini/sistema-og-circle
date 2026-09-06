import { getLinks } from "@/lib/config";
import type { NivelAcceso } from "@/lib/database.types";
import { PendienteClient } from "./PendienteClient";

// =============================================================================
// VGRP-22 — Pantalla de espera post-checkout.
//
// PUNTO CRÍTICO DEL PRD: esta pantalla (ni este archivo, ni PendienteClient)
// puede afirmar que el acceso está activo. El webhook de Mercado Pago
// (VGRP-23, en paralelo) es el ÚNICO que confirma el pago y proyecta el
// nivel — acá sólo se hace polling hasta que esa proyección se refleje en
// los claims del usuario. Ver el comentario grande en `PendienteClient.tsx`.
//
// Server Component delgado a propósito: sólo lee el query param `nivel`
// (texto informativo, "estás esperando la confirmación de tu compra de
// <nivel>" — nunca una confirmación) y se lo pasa al Client Component que
// hace el polling de verdad. Nada de esto lee `getVerifiedClaims()` acá: el
// nivel FRESCO se pide del lado del cliente en cada tick (ver
// `consultarNivelActual()` en `../_actions.ts`).
// =============================================================================

function esNivelAcceso(value: string | undefined): value is NivelAcceso {
  return value === "principiante" || value === "avanzado" || value === "ninguno";
}

export default async function ComprarPendientePage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string }>;
}) {
  const params = await searchParams;
  // Si el query param falta o viene con un valor inesperado (alguien navegó
  // acá a mano, o MP lo perdió en la redirección), se muestra un texto
  // genérico en vez de romper la página — es sólo informativo, el polling
  // funciona igual sin él.
  const nivelEsperado = esNivelAcceso(params.nivel) ? params.nivel : null;
  // El link de WhatsApp del estado de timeout viene de Edge Config
  // (`getLinks()`, ya con su propio fallback hardcodeado si Edge Config
  // falla — ver lib/config/index.ts), nunca de un número hardcodeado en el
  // Client Component: es el mismo dato que usa el resto de la plataforma
  // para el contacto de soporte, no algo propio de esta pantalla.
  const { whatsapp } = await getLinks();

  return <PendienteClient nivelEsperado={nivelEsperado} whatsappUrl={whatsapp} />;
}
