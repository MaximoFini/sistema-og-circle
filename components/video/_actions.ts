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
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

/**
 * Ids reales de `videos` hoy. Un admin puede borrar un video (lib/data/admin/contenido.ts)
 * que ya esté marcado como visto en el `progreso` de algún usuario — sin este filtro, ese
 * id huérfano infla "vistos" por encima de `TOTAL_VIDEOS` en StatsVideos (ej. "12 / 11").
 * Service role a propósito: es sólo una lectura de ids (nada sensible) y no debe atarse
 * a la policy por nivel de `videos_select_por_nivel` — un video ya visto sigue contando
 * aunque después se lo despublique o le cambien el nivel requerido.
 * Fail-open (null en vez de tirar): si la lectura falla, se muestra el progreso SIN
 * filtrar antes que romper el contador entero por un problema transitorio de la base.
 */
async function idsVideosVigentes(): Promise<Set<string> | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from("videos").select("id");
  if (error) return null;
  return new Set(data.map((v) => v.id));
}

function filtrarVigentes(ids: string[], vigentes: Set<string> | null): string[] {
  return vigentes ? ids.filter((id) => vigentes.has(id)) : ids;
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
  const [{ data }, vigentes] = await Promise.all([
    supabase.from("profiles").select("progreso").eq("id", id).maybeSingle(),
    idsVideosVigentes(),
  ]);

  return { videosVistos: filtrarVigentes(leerVideosVistos(data?.progreso), vigentes) };
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
  // Una sola lectura de `idsVideosVigentes()` para toda la función (antes se pedía de
  // nuevo en cada branch de salida): dos lecturas separadas podían, en la ventana entre
  // ellas, ver un video borrado por un admin en una y no en la otra — un `videosVistos`
  // inconsistente entre el early-return y el camino de escritura.
  const [{ data: perfil, error: errorLectura }, vigentes] = await Promise.all([
    supabase.from("profiles").select("progreso").eq("id", id).maybeSingle(),
    idsVideosVigentes(),
  ]);
  if (errorLectura) return { ok: false, error: "No pudimos leer tu progreso." };

  const actuales = leerVideosVistos(perfil?.progreso);
  if (actuales.includes(videoId)) {
    return { ok: true, videosVistos: filtrarVigentes(actuales, vigentes) };
  }

  const nuevo = [...actuales, videoId];
  const progresoExistente =
    perfil?.progreso && typeof perfil.progreso === "object" ? perfil.progreso : {};
  const { error: errorUpdate } = await supabase
    .from("profiles")
    .update({ progreso: { ...progresoExistente, videosVistos: nuevo } })
    .eq("id", id);
  if (errorUpdate) return { ok: false, error: "No pudimos guardar tu progreso." };

  return { ok: true, videosVistos: filtrarVigentes(nuevo, vigentes) };
}
