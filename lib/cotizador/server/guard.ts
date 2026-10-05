// VGRP-57 — guard de los endpoints de la calculadora (`/api/cotizador/*`).
//
// `middleware.ts` ya corta sin sesión (401 en `/api/`), pero NO gatea por
// nivel: desde VGRP-77 la página `/calculadora` se muestra también sin plan
// (borrosa e inerte, `RUTAS_POR_NIVEL`). Así que esto es LA barrera del plan
// para la calculadora: lo decide con la sesión REAL de esta request
// (`getVerifiedClaims()`), nunca con algo que mande el cliente.
//
// Cada handler lo llama PRIMERO, antes de leer el body o de pegarle a
// Anthropic / dolarapi: un usuario sin plan no puede gastar ni un token.

import "server-only";
import { NextResponse } from "next/server";
import { tieneAcceso } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";

/**
 * `null` si el usuario tiene el plan completo (VGRP-59/60: un solo plan); si
 * no, la respuesta que el handler tiene que devolver tal cual: 401 sin
 * sesión, 403 con nivel `ninguno`.
 */
export async function requierePlan(): Promise<NextResponse | null> {
  const claims = await getVerifiedClaims();
  if (!claims) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!tieneAcceso(claims)) {
    return NextResponse.json(
      { error: "Necesitás un plan para usar la calculadora." },
      { status: 403 },
    );
  }
  return null;
}
