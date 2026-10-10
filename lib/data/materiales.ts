// VGRP-88 — lectura pública de los materiales descargables de /formacion.
//
// `import "server-only"`: este archivo es el único lugar que lee la tabla `materiales` para
// el usuario final, y NUNCA saca `storage_path` (el select ni siquiera lo pide). El archivo
// se descarga con la Server Action `descargarMaterial`, que verifica el plan y firma una URL
// de corta duración.
//
// Service role (no un cliente con RLS) a propósito: la tabla no tiene policies para
// `authenticated` — si un material se leyera con la sesión del usuario, `storage_path`
// quedaría al alcance de cualquier cuenta. Mismo criterio que lib/data/videos.ts: la
// lista es la misma para todos y el gating por plan se aplica al DESCARGAR, no al listar
// (sin plan se ve la lista, bloqueada: US-6).

import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import type { Database } from "../database.types";
import { EXTENSIONES, type ExtensionMaterial, type MaterialItem } from "../materiales/tipos";
import { createServiceRoleClient } from "../supabase/service-role";
import { TAG_POR_ENTIDAD } from "./admin/contenido";

type AdminClient = SupabaseClient<Database>;

/** Red de contención de la consulta, no un tope de producto (docs/RENDIMIENTO.md, regla 7). */
const LIMITE_FILAS = 200;

type FilaMaterial = Pick<
  Database["public"]["Tables"]["materiales"]["Row"],
  "id" | "titulo" | "descripcion" | "extension" | "tamano_bytes"
>;

/**
 * Fila → lo que ve el usuario. El `tipo` se deriva de la extensión (la fuente de verdad en
 * lib/materiales/tipos.ts), no se confía en la columna: una fila con una extensión que no
 * está en la lista se descarta en vez de mostrar un ícono o una descarga rotos.
 */
export function aMaterialItem(fila: FilaMaterial): MaterialItem | null {
  if (!Object.hasOwn(EXTENSIONES, fila.extension)) return null;
  const extension = fila.extension as ExtensionMaterial;
  return {
    id: fila.id,
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    tipo: EXTENSIONES[extension].tipo,
    extension,
    tamanoBytes: Number(fila.tamano_bytes),
  };
}

/** Núcleo testable (cliente inyectado, mismo patrón que lib/data/videos.ts). */
export async function listarMaterialesPublicados(admin: AdminClient): Promise<MaterialItem[]> {
  const { data, error } = await admin
    .from("materiales")
    // Sin `storage_path` a propósito: ver el comentario de cabecera.
    .select("id, titulo, descripcion, extension, tamano_bytes")
    .eq("publicado", true)
    .order("orden", { ascending: true })
    .limit(LIMITE_FILAS);
  if (error) throw error;

  return (data ?? []).flatMap((fila) => {
    const item = aMaterialItem(fila);
    return item ? [item] : [];
  });
}

// unstable_cache no puede recibir el cliente (no serializable): cada invocación crea el
// suyo. El tag es el que dispara revalidateTag() en cada escritura sobre `materiales`.
const listarMaterialesPublicadosCached = unstable_cache(
  () => listarMaterialesPublicados(createServiceRoleClient()),
  ["materiales-publicados"],
  { tags: [TAG_POR_ENTIDAD.materiales] },
);

/**
 * Fail-open, por el mismo motivo que lib/data/videos.ts: `/formacion/[variante]` es una
 * ruta estática y esta lectura corre durante `next build`. Si la base falla, la card sale
 * con su estado vacío en vez de voltear el deploy entero. Sentry avisa que pasó.
 *
 * El catch va AFUERA de `unstable_cache` a propósito: así el fallo no se cachea y el
 * request siguiente vuelve a intentar la lectura real.
 */
export async function obtenerMateriales(): Promise<MaterialItem[]> {
  try {
    return await listarMaterialesPublicadosCached();
  } catch (error) {
    Sentry.captureException(error, {
      level: "error",
      tags: { "materiales-degradado": "true" },
      extra: {
        detalle:
          "No se pudo leer la tabla `materiales`; la card se sirve vacía. Si ocurrió durante " +
          "`next build`, el HTML estático queda degradado hasta el próximo revalidateTag.",
      },
    });
    return [];
  }
}
