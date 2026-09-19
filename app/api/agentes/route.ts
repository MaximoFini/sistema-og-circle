import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import { obtenerAgentesCacheados } from "@/lib/data/agentes";

// VGRP-30/38 (seguimiento) — reemplaza app/api/demo/agentes/route.ts. Deliberadamente
// dinámico (Route Handler, no parte del shell estático de `(app)`): lee la sesión REAL
// en cada request con `getVerifiedClaims()`, nunca el nivel de un segmento de URL — ver
// lib/data/secretos.ts.
//
// VGRP-55 punto 1 — obtenerAgentesCacheados() cachea la LECTURA de filas
// (unstable_cache); el gating por nivel sigue corriendo en cada request con
// los claims de ESTA request, nunca desde la caché.
export async function GET() {
  const claims = await getVerifiedClaims();

  // VGRP-49 — bug real encontrado escribiendo los tests de este endpoint: no
  // había try/catch acá. Un error de Postgres (o cualquier otra falla de
  // obtenerAgentesCacheados) se propagaba sin envolver — mismo criterio que
  // el resto de los Route Handlers del repo (ver
  // app/api/admin/contenido/[entidad]/route.ts): nunca dejar que el mensaje
  // crudo de la base llegue al cliente.
  try {
    const agentes = await obtenerAgentesCacheados(claims);
    return NextResponse.json({ agentes, nivelActual: getNivel(claims) });
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "obtenerAgentes" } });
    return NextResponse.json(
      { error: "No se pudo cargar el directorio de agentes." },
      { status: 500 },
    );
  }
}
