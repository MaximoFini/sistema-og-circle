// VGRP-57 — guard de los endpoints de la calculadora (`/api/cotizador/*`).
//
// Defensa en profundidad: `middleware.ts` ya corta sin sesión (401 en
// `/api/`), pero el NIVEL de plan sólo se gatea por ruta de PÁGINA ahí
// (`RUTAS_CON_PLAN`); para las APIs lo decide esto, con la sesión REAL de
// esta request (`getVerifiedClaims()`), nunca con algo que mande el cliente.
//
// Cada handler lo llama PRIMERO, antes de leer el body o de pegarle a
// Anthropic / dolarapi: un usuario sin plan no puede gastar ni un token.

import "server-only";
import { NextResponse } from "next/server";
import { hasNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";

/**
 * `null` si el usuario tiene plan (`principiante` o más); si no, la respuesta
 * que el handler tiene que devolver tal cual: 401 sin sesión, 403 con nivel
 * `ninguno`.
 */
export async function requierePlan(): Promise<NextResponse | null> {
  const claims = await getVerifiedClaims();
  if (!claims) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!hasNivel(claims, "principiante")) {
    return NextResponse.json(
      { error: "Necesitás un plan para usar la calculadora." },
      { status: 403 },
    );
  }
  return null;
}
