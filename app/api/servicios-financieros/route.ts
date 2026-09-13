import { NextResponse } from "next/server";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import { obtenerServiciosFinancieros } from "@/lib/data/servicios";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// VGRP-32 — mismo patrón que app/api/agentes/route.ts. Gating por fila (nivel_requerido
// de cada servicio), resuelto con la sesión REAL de cada request, nunca por URL.
export async function GET() {
  const claims = await getVerifiedClaims();
  const admin = createServiceRoleClient();
  const servicios = await obtenerServiciosFinancieros(admin, claims);

  return NextResponse.json({ servicios, nivelActual: getNivel(claims) });
}
