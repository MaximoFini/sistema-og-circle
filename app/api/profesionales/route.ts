import { NextResponse } from "next/server";
import { getVerifiedClaims } from "@/lib/auth/server";
import { obtenerProfesionales } from "@/lib/data/profesionales";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// VGRP-32 — mismo patrón que app/api/agentes/route.ts: Route Handler dinámico, lee la
// sesión REAL en cada request. Sin gating por nivel (profesionales no lo tiene), pero
// igual dinámico: `contacto` nunca debe resolverse en el camino estático del dashboard.
export async function GET() {
  const claims = await getVerifiedClaims();
  const admin = createServiceRoleClient();
  const profesionales = await obtenerProfesionales(admin, claims);

  return NextResponse.json({ profesionales });
}
