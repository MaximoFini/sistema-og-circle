"use server";

// VGRP-29 — Server Actions de progreso de video. Mismo patrón que
// app/(app)/comprar/_actions.ts (crearCheckout, consultarNivelActual): un Server Action
// es un endpoint HTTP propio, así que se chequea sesión acá mismo, sin delegar en el
// middleware ni en que el caller ya esté logueado.
//
// `createSupabaseServerClient()` (cookie-based, RLS) y NO service role: la policy
// `profiles_update_own` (init_plataforma.sql) ya restringe el UPDATE a la propia fila
// (`id = auth.uid()`); el `.eq("id", claims.sub)` de abajo es defensa en profundidad
// explícita, no el único candado.

import { createSupabaseServerClient, getVerifiedClaims } from "@/lib/auth/server";

interface ProgresoForma {
  videosVistos: string[];
}

function leerVideosVistos(progreso: unknown): string[] {
  if (
    progreso &&
    typeof progreso === "object" &&
    Array.isArray((progreso as ProgresoForma).videosVistos)
  ) {
    return (progreso as ProgresoForma).videosVistos.filter(
      (v): v is string => typeof v === "string",
    );
  }
  return [];
}

function userId(claims: Awaited<ReturnType<typeof getVerifiedClaims>>): string | null {
  const sub = claims?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

export async function obtenerProgresoVideos(): Promise<{ videosVistos: string[] }> {
  const claims = await getVerifiedClaims();
  const id = userId(claims);
  if (!id) return { videosVistos: [] };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("progreso").eq("id", id).maybeSingle();

  return { videosVistos: leerVideosVistos(data?.progreso) };
}

export type MarcarVideoVistoResult =
  | { ok: true; videosVistos: string[] }
  | { ok: false; error: string };

/**
 * Idempotente: marcar el mismo video dos veces no duplica su id (US-4). El patrón
 * lectura→merge→escritura no es atómico a nivel Postgres, pero con un solo usuario
 * escribiendo su propia fila (nunca concurrencia entre usuarios distintos sobre la
 * misma fila) el peor caso de dos clics casi simultáneos converge al mismo resultado —
 * no se agrega un `jsonb_set` atómico para este alcance.
 */
export async function marcarVideoVisto(videoId: string): Promise<MarcarVideoVistoResult> {
  const claims = await getVerifiedClaims();
  const id = userId(claims);
  if (!id) return { ok: false, error: "Tenés que iniciar sesión." };

  const supabase = await createSupabaseServerClient();
  const { data: perfil, error: errorLectura } = await supabase
    .from("profiles")
    .select("progreso")
    .eq("id", id)
    .maybeSingle();
  if (errorLectura) return { ok: false, error: "No pudimos leer tu progreso." };

  const actuales = leerVideosVistos(perfil?.progreso);
  if (actuales.includes(videoId)) return { ok: true, videosVistos: actuales };

  const nuevo = [...actuales, videoId];
  const progresoExistente =
    perfil?.progreso && typeof perfil.progreso === "object" ? perfil.progreso : {};
  const { error: errorUpdate } = await supabase
    .from("profiles")
    .update({ progreso: { ...progresoExistente, videosVistos: nuevo } })
    .eq("id", id);
  if (errorUpdate) return { ok: false, error: "No pudimos guardar tu progreso." };

  return { ok: true, videosVistos: nuevo };
}
