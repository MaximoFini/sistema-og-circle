import { NextResponse } from "next/server";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import { obtenerServiciosFinancierosCacheados } from "@/lib/data/servicios";

// VGRP-32 — mismo patrón que app/api/agentes/route.ts. Gating por fila (nivel_requerido
// de cada servicio), resuelto con la sesión REAL de cada request, nunca por URL.
//
// VGRP-55 punto 1 — obtenerServiciosFinancierosCacheados() cachea la lectura de
// filas; el gating sigue corriendo en cada request, nunca desde la caché.
export async function GET() {
  const claims = await getVerifiedClaims();
  const servicios = await obtenerServiciosFinancierosCacheados(claims);

  return NextResponse.json({ servicios, nivelActual: getNivel(claims) });
}
