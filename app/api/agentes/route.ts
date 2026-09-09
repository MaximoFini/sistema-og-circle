import { NextResponse } from "next/server";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import { obtenerAgentes } from "@/lib/data/agentes";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// VGRP-30/38 (seguimiento) — reemplaza app/api/demo/agentes/route.ts. Deliberadamente
// dinámico (Route Handler, no parte del shell estático de `(app)`): lee la sesión REAL
// en cada request con `getVerifiedClaims()`, nunca el nivel de un segmento de URL — ver
// lib/data/secretos.ts.
export async function GET() {
  const claims = await getVerifiedClaims();
  const admin = createServiceRoleClient();
  const agentes = await obtenerAgentes(admin, claims);

  return NextResponse.json({ agentes, nivelActual: getNivel(claims) });
}
