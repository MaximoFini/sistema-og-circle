import * as Sentry from "@sentry/nextjs";
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

  // VGRP-49 — bug real encontrado escribiendo los tests de este endpoint: no
  // había try/catch acá. Un error de Postgres (o cualquier otra falla de
  // obtenerAgentes) se propagaba sin envolver — mismo criterio que el resto
  // de los Route Handlers del repo (ver app/api/admin/contenido/[entidad]/route.ts):
  // nunca dejar que el mensaje crudo de la base llegue al cliente.
  try {
    const agentes = await obtenerAgentes(admin, claims);
    return NextResponse.json({ agentes, nivelActual: getNivel(claims) });
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "obtenerAgentes" } });
    return NextResponse.json(
      { error: "No se pudo cargar el directorio de agentes." },
      { status: 500 },
    );
  }
}
