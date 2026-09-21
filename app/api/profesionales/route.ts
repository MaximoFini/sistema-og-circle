import { NextResponse } from "next/server";
import { getVerifiedClaims } from "@/lib/auth/server";
import { obtenerProfesionalesCacheados } from "@/lib/data/profesionales";

// VGRP-32 — mismo patrón que app/api/agentes/route.ts: Route Handler dinámico, lee la
// sesión REAL en cada request. Sin gating por nivel (profesionales no lo tiene), pero
// igual dinámico: `contacto` nunca debe resolverse en el camino estático del dashboard.
//
// VGRP-55 punto 1 — obtenerProfesionalesCacheados() cachea la lectura de filas; el
// chequeo de sesión sigue corriendo en cada request, nunca desde la caché.
export async function GET() {
  const claims = await getVerifiedClaims();
  const profesionales = await obtenerProfesionalesCacheados(claims);

  return NextResponse.json({ profesionales });
}
