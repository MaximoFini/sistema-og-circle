// Foto de perfil de agentes y profesionales — acceso al bucket de Storage.
// Spec: specs/foto-perfil-agentes-profesionales/design.md
//
// Mismo patrón que lib/data/admin/contenido.ts: el cliente (service_role) se
// INYECTA, así estos helpers se testean con createTestAdminClient().
//
// El bucket es público de LECTURA (las fotos no son datos sensibles) y no tiene
// policies de escritura para anon/authenticated: sólo service_role sube/borra
// (migración 20261009120000_foto_directorio.sql).

import "server-only";

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { getEnv } from "../env";
import { type EntidadConFoto, FOTO_BUCKET } from "./constantes";

type AdminClient = SupabaseClient<Database>;

/**
 * Sube una foto ya procesada (WebP) y devuelve su ruta en el bucket.
 * La ruta lleva un uuid nuevo por subida: la URL resultante es inmutable, así
 * que se puede cachear para siempre y reemplazar una foto no invalida nada.
 */
export async function subirFoto(
  admin: AdminClient,
  entidad: EntidadConFoto,
  id: string,
  webp: Buffer,
): Promise<string> {
  const path = `${entidad}/${id}/${randomUUID()}.webp`;
  const { error } = await admin.storage.from(FOTO_BUCKET).upload(path, webp, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Borra un objeto del bucket. Best-effort: si falla, el objeto queda huérfano
 * (basura en Storage, nunca un registro roto) y se reporta a Sentry. Devuelve
 * si se pudo borrar. Borrar una ruta que no existe no es un error.
 */
export async function borrarFoto(admin: AdminClient, path: string | null): Promise<boolean> {
  if (!path) return true;
  try {
    const { error } = await admin.storage.from(FOTO_BUCKET).remove([path]);
    if (error) throw error;
    return true;
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "borrarFoto: objeto huérfano", path } });
    return false;
  }
}

/** URL pública de una foto, sin ir a la red. `null` si no hay foto. */
export function urlPublicaFoto(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = getEnv("NEXT_PUBLIC_SUPABASE_URL", "Para armar la URL pública de las fotos.");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${FOTO_BUCKET}/${path}`;
}
