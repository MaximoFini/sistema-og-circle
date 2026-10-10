"use server";

// VGRP-88 — descarga de un material de /formacion.
//
// Un Server Action es un endpoint HTTP propio: el plan se verifica ACÁ con la sesión real de
// esta request (`getVerifiedClaims()`), nunca con algo que mande el cliente. Es LA barrera
// de los materiales: la página sin plan muestra la lista (US-6) y el botón deshabilitado,
// pero quien llame a esta acción a mano igual recibe un error.
//
// La URL que devuelve es firmada y vence en 120 s: no hay ningún link permanente al archivo
// en el HTML, y compartirla no sirve de nada pasado ese rato.

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { tieneAcceso } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import { urlDescarga } from "@/lib/materiales/storage";
import { nombreDescarga } from "@/lib/materiales/tipos";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type DescargarMaterialResult = { ok: true; url: string } | { ok: false; error: string };

const SEGUNDOS_URL = 120;

export async function descargarMaterial(id: string): Promise<DescargarMaterialResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, error: "Tenés que iniciar sesión." };
  if (!tieneAcceso(claims)) return { ok: false, error: "Necesitás el plan para descargar." };

  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Este material ya no está disponible." };
  }

  try {
    // Service role: la tabla no tiene policies para `authenticated` (storage_path es
    // sensible). Solo publicados: un material oculto no se descarga aunque se sepa su id.
    const { data, error } = await createServiceRoleClient()
      .from("materiales")
      .select("storage_path, titulo, extension")
      .eq("id", id)
      .eq("publicado", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "Este material ya no está disponible." };

    const url = await urlDescarga(
      data.storage_path,
      nombreDescarga(data.titulo, data.extension),
      SEGUNDOS_URL,
    );
    if (!url) return { ok: false, error: "No pudimos generar la descarga. Probá de nuevo." };
    return { ok: true, url };
  } catch (error) {
    Sentry.captureException(error, { extra: { detalle: "descargarMaterial", id } });
    return { ok: false, error: "No pudimos generar la descarga. Probá de nuevo." };
  }
}
