// VGRP-88 — acceso al bucket privado `materiales` de Supabase Storage.
//
// Todo con service role: el bucket no tiene policies para anon/authenticated, así que subir,
// firmar y borrar es cosa exclusiva del servidor. Lo usan el CRUD del admin (contenido.ts,
// las rutas de subida) y la Server Action de descarga.
//
// Layout del bucket (ver PREFIJO_PENDIENTES / PREFIJO_ARCHIVOS en ./tipos):
//   pendientes/<uuid>.<ext>  subida en curso o sin guardar; lo que tenga más de 24 h es
//                            huérfano por definición y lo barre `barrerPendientes()`.
//   archivos/<uuid>.<ext>    el archivo de un material ya guardado.

import "server-only";

import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "../supabase/service-role";
import {
  EXTENSIONES,
  type ExtensionMaterial,
  extensionDe,
  PATH_PENDIENTE_REGEX,
  PREFIJO_ARCHIVOS,
  PREFIJO_PENDIENTES,
} from "./tipos";

export const BUCKET_MATERIALES = "materiales";

/** Un pendiente más viejo que esto es huérfano: nadie lo va a guardar ya. */
const VIDA_PENDIENTE_MS = 24 * 60 * 60 * 1000;
/** Cuántos pendientes mira cada barrido. Más que suficiente: se barre en cada subida. */
const LIMITE_BARRIDO = 100;

export interface SubidaFirmada {
  /** `pendientes/<uuid>.<ext>` */
  path: string;
  signedUrl: string;
  /** Content-Type con el que el cliente tiene que subir el archivo. */
  contentType: string;
}

export interface ObjetoVerificado {
  tamanoBytes: number;
  mime: string;
}

function bucket() {
  return createServiceRoleClient().storage.from(BUCKET_MATERIALES);
}

/** URL de subida firmada para que el navegador del admin suba directo a Storage. El token
 *  autoriza ese path puntual y nada más. */
export async function crearSubidaFirmada(extension: ExtensionMaterial): Promise<SubidaFirmada> {
  const path = `${PREFIJO_PENDIENTES}${crypto.randomUUID()}.${extension}`;
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl, contentType: EXTENSIONES[extension].mime };
}

/** Metadata REAL del objeto (la que guardó Storage, no la que declaró el cliente); `null`
 *  si no existe. */
export async function verificarObjeto(path: string): Promise<ObjetoVerificado | null> {
  const archivos = bucket();
  const { data: existe, error: errorExiste } = await archivos.exists(path);
  if (errorExiste) throw errorExiste;
  if (!existe) return null;

  const { data, error } = await archivos.info(path);
  if (error) throw error;
  return { tamanoBytes: data.size ?? 0, mime: data.contentType ?? "" };
}

/** Mueve `pendientes/...` a `archivos/<uuid nuevo>.<ext>` y devuelve el path final. */
export async function moverAArchivos(pathPendiente: string): Promise<string> {
  if (!PATH_PENDIENTE_REGEX.test(pathPendiente)) {
    throw new Error(`moverAArchivos: no es un path pendiente válido (${pathPendiente})`);
  }
  const extension = extensionDe(pathPendiente);
  if (!extension) throw new Error(`moverAArchivos: extensión no permitida (${pathPendiente})`);
  const destino = `${PREFIJO_ARCHIVOS}${crypto.randomUUID()}.${extension}`;
  const { error } = await bucket().move(pathPendiente, destino);
  if (error) throw error;
  return destino;
}

/** Idempotente: borrar algo que no existe no es un error. */
export async function borrarObjeto(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) throw error;
}

/**
 * URL firmada de descarga (vence en `segundos`), con `Content-Disposition: attachment` y
 * `nombreArchivo` como nombre. `null` si Storage no la pudo generar.
 *
 * El parámetro `download` se arma acá y NO con la opción `download` de `createSignedUrl`:
 * storage-js lo codifica dos veces, y Storage termina mandando el nombre escapado
 * ("Gu%C3%ADa de importaci%C3%B3n.pdf", "%5Btest%5D…"). Con una sola codificación el header
 * sale bien: `filename*=UTF-8''Gu%C3%ADa%20de%20importaci%C3%B3n.pdf`, que los navegadores
 * usan con preferencia. Verificado contra el proyecto real (VGRP-88).
 */
export async function urlDescarga(
  path: string,
  nombreArchivo: string,
  segundos = 120,
): Promise<string | null> {
  const { data, error } = await bucket().createSignedUrl(path, segundos);
  if (error || !data) {
    Sentry.captureException(error ?? new Error("createSignedUrl sin datos"), {
      level: "error",
      tags: { "materiales-descarga": "true" },
      extra: { path },
    });
    return null;
  }
  const url = new URL(data.signedUrl);
  url.searchParams.set("download", nombreArchivo);
  return url.toString();
}

/**
 * Borra de `pendientes/` lo que tenga más de 24 h. Best effort: NUNCA tira, porque se llama
 * antes de dar una URL de subida y un fallo del barrido no tiene que impedir subir.
 */
export async function barrerPendientes(): Promise<void> {
  try {
    const archivos = bucket();
    const { data, error } = await archivos.list(PREFIJO_PENDIENTES.replace(/\/$/, ""), {
      limit: LIMITE_BARRIDO,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw error;

    const corte = Date.now() - VIDA_PENDIENTE_MS;
    const viejos = (data ?? [])
      // `list` también devuelve "carpetas" (id null) y placeholders: solo objetos reales.
      .filter((o) => o.id && o.created_at && new Date(o.created_at).getTime() < corte)
      .map((o) => `${PREFIJO_PENDIENTES}${o.name}`);
    if (viejos.length === 0) return;

    const { error: errorBorrado } = await archivos.remove(viejos);
    if (errorBorrado) throw errorBorrado;
  } catch (error) {
    Sentry.captureException(error, {
      level: "warning",
      tags: { "materiales-barrido": "true" },
    });
  }
}
