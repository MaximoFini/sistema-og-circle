// =============================================================================
// VGRP-17 — Middleware de sesión + gating de acceso para el route group
// `(app)`.
//
// Por qué este archivo tiene SU PROPIO cliente de Supabase en vez de
// reusar `createSupabaseServerClient()` / `getVerifiedClaims()` de
// `lib/auth/server.ts`:
//
// Ese módulo lee/escribe cookies con `cookies()` de `next/headers`, una API
// que sólo funciona dentro del contexto de request de Server Components,
// Server Actions y Route Handlers. El Middleware de Next.js corre ANTES de
// ese contexto (Edge runtime, firma `(request: NextRequest) => NextResponse`)
// y no tiene acceso a `next/headers` — es el propio patrón oficial de
// `@supabase/ssr` para Next.js el que pide un cliente separado en
// `middleware.ts`, construido sobre `request.cookies` / `response.cookies`
// en vez de `next/headers`. Ver:
// https://supabase.com/docs/guides/auth/server-side/nextjs (sección
// Middleware).
//
// Lo que SÍ se respeta de `lib/auth/server.ts` es la regla dura: nunca se
// llama a `supabase.auth.getUser()` (roundtrip de red por request). Acá,
// igual que en `getVerifiedClaims()`, se usa `supabase.auth.getClaims()`,
// que verifica el JWT localmente contra las claves públicas del proyecto.
// No hay parsing de cookies ni de JWT a mano en ningún lado de este
// archivo — todo pasa por `@supabase/ssr`.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "./lib/database.types";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (config de Supabase).`);
  }
  return value;
}

export async function middleware(request: NextRequest) {
  // Respuesta "pass-through" por default. Si `setAll` de abajo se dispara
  // (Supabase necesita refrescar el access token con el refresh token), se
  // reemplaza por una nueva `NextResponse` que además lleva las cookies de
  // sesión actualizadas — así el refresh de sesión llega al browser en la
  // misma respuesta, sin request extra.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // REGLA DURA (ver lib/auth/server.ts): `getClaims()`, nunca `getUser()`.
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// El matcher es la única defensa real: corre ANTES del render, así que una
// ruta privada sin sesión nunca llega a pintar nada (sin flash de
// contenido). Por eso tiene que ser preciso en los dos sentidos:
//
// - No de más: excluye assets estáticos (_next/static, _next/image,
//   favicon, archivos con extensión de imagen/fuente) para no pagar el
//   costo de este middleware (verificación de JWT) en cada asset.
// - No de menos: sólo lista rutas de `(app)` — nunca `(auth)` (login tiene
//   que ser alcanzable sin sesión, si no, nadie puede loguearse) ni
//   `(legal)` (páginas públicas).
//
// Los route groups (`(app)`, `(auth)`, `(legal)`) son invisibles en la URL:
// no generan un prefijo común como `/app/*` que se pueda matchear con un
// patrón genérico. Hoy la única ruta real dentro de `(app)` es
// `/dashboard`. CUALQUIER página nueva agregada bajo `app/(app)/` tiene que
// sumarse a este array o queda sin proteger.
export const config = {
  matcher: ["/dashboard/:path*"],
};
