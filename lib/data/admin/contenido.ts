// =============================================================================
// VGRP-38 / Bloque 7 — Capa de datos del CRUD de contenido (agentes, videos,
// profesionales, servicios_financieros). VGRP-88 suma `materiales`.
//
// Mismo patrón que lib/data/admin/usuarios.ts: el cliente se INYECTA (nunca se
// crea acá), así estos helpers son testeables con createTestAdminClient() y no
// arrastran `import "server-only"` a los tests.
//
// LISTA BLANCA (`ENTIDADES`): es la única forma en que `:entidad` de la URL
// llega a convertirse en un nombre de tabla real — nunca se interpola el
// string crudo del request en una llamada a `.from()`.
// =============================================================================

import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "../../database.types";
import { borrarObjeto, moverAArchivos, verificarObjeto } from "../../materiales/storage";
import {
  EXTENSIONES,
  type ExtensionMaterial,
  extensionDe,
  formatearTamano,
  MAX_BYTES,
  PATH_PENDIENTE_REGEX,
} from "../../materiales/tipos";
import { videoProvider } from "../../video/provider";
import type { ResultadoMutacion } from "./audit-log";

type AdminClient = SupabaseClient<Database>;

export const ENTIDADES = [
  "agentes",
  "videos",
  "profesionales",
  "servicios_financieros",
  "materiales",
] as const;
export type Entidad = (typeof ENTIDADES)[number];

export function esEntidadValida(valor: string): valor is Entidad {
  return (ENTIDADES as readonly string[]).includes(valor);
}

/** El campo que representa "visible/vigente" difiere por entidad: `videos` y
 *  `materiales` usan `publicado`, el resto usa `activo`. Un solo lugar que lo sepa. */
export function campoVigencia(entidad: Entidad): "activo" | "publicado" {
  return entidad === "videos" || entidad === "materiales" ? "publicado" : "activo";
}

/**
 * Tag de `revalidateTag` por entidad — VGRP-29 es quien realmente los
 * consume desde sus grillas (`fetch(..., { next: { tags: [...] } })` o
 * `unstable_cache`). Definidos acá para que exista un solo lugar con el
 * nombre real de cada tag, sin que cada route handler invente el suyo.
 */
export const TAG_POR_ENTIDAD: Record<Entidad, string> = {
  agentes: "grilla-agentes",
  videos: "grilla-videos",
  profesionales: "grilla-profesionales",
  servicios_financieros: "grilla-servicios",
  materiales: "grilla-materiales",
};

/**
 * VGRP-88 — el archivo de un material no sirve (no se subió, está vacío o pasa el tope). Es un
 * error del pedido, no del servidor: las rutas lo devuelven como 400 con este mensaje, que
 * está escrito para que lo lea el admin.
 */
export class ArchivoInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ArchivoInvalido";
  }
}

export class ItemNoEncontrado extends Error {
  constructor(entidad: Entidad, id: string) {
    super(`No existe un ítem de "${entidad}" con id ${id}.`);
    this.name = "ItemNoEncontrado";
  }
}

// -----------------------------------------------------------------------------
// Schemas de Zod — uno por entidad, porque los campos no coinciden entre sí.
// -----------------------------------------------------------------------------

const agenteSchema = z.object({
  nombre: z.string().trim().min(1),
  especialidad: z.string().trim().min(1),
  contacto: z.string().trim().min(1).nullable().optional(),
  orden: z.number().int(),
  activo: z.boolean(),
});

const videoSchema = z.object({
  // 3 = video explicativo del directorio de agentes (VGRP-31) — ver comment de
  // columna en la migración 20260912233815_videos_stage_explicativo.sql.
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  titulo: z.string().trim().min(1),
  descripcion: z.string().trim().nullable().optional(),
  // SENSIBLE — igual pasa por acá porque el admin SÍ puede cargar/editarlo;
  // lo que nunca debe pasar es que este valor llegue a un cliente sin nivel
  // (VGRP-30, resolverSecreto()) o a un video con publicado=false.
  // El admin puede pegar el link completo: se normaliza al id con
  // videoProvider.parsearRef() y se rechaza lo que no sea un video reconocible
  // (antes se guardaba cualquier string y el embed fallaba en silencio).
  // `.optional()` va AL FINAL: un PATCH sin el campo (ej. el soft-delete) no
  // corre el transform y no lo pisa.
  provider_ref: z
    .string()
    .nullable()
    .transform((valor, ctx) => {
      if (!valor?.trim()) return null;
      const ref = videoProvider.parsearRef(valor);
      if (ref) return ref;
      ctx.addIssue({
        code: "custom",
        message: `No es un link de ${videoProvider.nombre} válido. Pegá el link completo del video.`,
      });
      return z.NEVER;
    })
    .optional(),
  // El admin ya no tipea el orden de un video: lo define arrastrando en el
  // listado (reordenarVideos). Al crear, si no viene, queda al final.
  orden: z.number().int().optional(),
  publicado: z.boolean(),
});

const profesionalSchema = z.object({
  nombre: z.string().trim().min(1),
  rubro: z.string().trim().min(1),
  descripcion: z.string().trim().nullable().optional(),
  contacto: z.string().trim().nullable().optional(),
  orden: z.number().int(),
  activo: z.boolean(),
});

const servicioFinancieroSchema = z.object({
  titulo: z.string().trim().min(1),
  descripcion: z.string().trim().nullable().optional(),
  orden: z.number().int(),
  activo: z.boolean(),
});

// VGRP-88 — materiales descargables de /formacion. El archivo no viaja en este body: el
// admin lo sube antes, directo a Storage (POST /api/admin/contenido/materiales/subida), y
// acá llega solo el path PENDIENTE que devolvió esa ruta. `tipo`, `extension`, `tamano_bytes`
// y `storage_path` los deriva el servidor al guardar (ver `prepararArchivo`) — por eso no
// están en el schema: nunca se aceptan del request.
const materialSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(500).nullable().optional(),
  publicado: z.boolean().optional(),
  // Como en videos: al crear, si no viene, queda al final.
  orden: z.number().int().optional(),
  // Obligatorio al crear; al editar, presente = reemplazo del archivo.
  storage_path_pendiente: z.string().regex(PATH_PENDIENTE_REGEX).optional(),
});

const SCHEMAS = {
  agentes: agenteSchema,
  videos: videoSchema,
  profesionales: profesionalSchema,
  servicios_financieros: servicioFinancieroSchema,
  materiales: materialSchema,
} as const satisfies Record<Entidad, z.ZodType>;

// -----------------------------------------------------------------------------
// CRUD genérico
// -----------------------------------------------------------------------------

/**
 * El generador de tipos de Supabase resuelve `.from()` contra un nombre de
 * tabla LITERAL; con `E extends Entidad` genérico no logra angostar
 * `Row`/`Insert`/`Update` (aunque en runtime `entidad` siempre sea una de las
 * 4 tablas reales) — termina distribuyendo sobre TODAS las tablas de
 * `Database`, no sólo las 4 de acá. Es una limitación de expresividad de ese
 * generador, no un hueco de seguridad: `esEntidadValida()` en el route
 * handler ya garantiza el nombre real, y `SCHEMAS[entidad].parse()` ya
 * garantiza la forma real, ANTES de que este archivo toque la base. Este
 * helper es el único punto del archivo con un cast a `any` — todo lo que
 * entra o sale de acá sigue tipado por las firmas públicas de abajo.
 */
function tabla(admin: AdminClient, entidad: Entidad) {
  return (admin as unknown as SupabaseClient).from(entidad);
}

export async function listarContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
): Promise<Tables<E>[]> {
  // VGRP-54 punto 9 — sin `.limit()` explícito, un listado sin paginación en
  // la UI (a diferencia de listarPagos/listarUsuarios/listarAuditLog, que
  // paginan por keyset). Ninguna de las 4 tablas se acerca hoy a este techo;
  // es la red de contención, no un cambio de comportamiento.
  const { data, error } = await tabla(admin, entidad)
    .select("*")
    .order("orden", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Tables<E>[];
}

export async function obtenerContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
  id: string,
): Promise<Tables<E> | null> {
  const { data, error } = await tabla(admin, entidad).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Tables<E> | null;
}

/**
 * `valores` sin validar (viene del body del request) — cada llamada valida
 * con el schema de SU entidad. El cast a `TablesInsert<E>` después del
 * `.parse()` es necesario porque `SCHEMAS` está tipado como
 * `Record<Entidad, z.ZodType>` (para poder tener 4 schemas distintos en un
 * mismo mapa): TypeScript no puede enlazar automáticamente "el resultado de
 * parsear con SCHEMAS[entidad]" al tipo exacto de la fila de `entidad" — Zod
 * ya validó la forma real en runtime, este cast no le agrega ni le saca
 * seguridad a lo que ya se validó.
 */
async function proximoOrden(admin: AdminClient, entidad: "videos" | "materiales"): Promise<number> {
  const { data, error } = await tabla(admin, entidad)
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return ((data as { orden: number } | null)?.orden ?? -1) + 1;
}

/**
 * Reparte los "lugares" (valores de `orden`) que hoy ocupa un grupo de videos
 * entre `ids`, en el orden nuevo: `ids[0]` toma el lugar más bajo, etc. Así se
 * puede reordenar un subconjunto (un stage) sin pisar el orden del resto, y el
 * listado completo del panel sigue coherente. Si hay valores repetidos (dos
 * videos con el mismo `orden`) se desempatan sumando 1: dentro del grupo el
 * orden queda estricto.
 */
export function asignarOrden(ids: string[], ordenActual: number[]): Map<string, number> {
  const lugares = [...ordenActual].sort((a, b) => a - b);
  let previo = Number.NEGATIVE_INFINITY;
  const asignado = new Map<string, number>();
  ids.forEach((id, i) => {
    previo = Math.max(lugares[i], previo + 1);
    asignado.set(id, previo);
  });
  return asignado;
}

/**
 * Reordena los ítems que recibe (todos, o los de un stage de videos): `ids` es el orden
 * nuevo y cada uno toma un lugar de los que el grupo ya ocupaba (ver
 * `asignarOrden`). No hay unique sobre `orden`, así que los updates no chocan
 * entre sí; se validan los ids contra la base antes de escribir para no
 * reordenar a medias por un id inexistente. No es atómico entre filas (un
 * update por ítem), pero reescribir el mismo orden es idempotente: reintentar
 * converge.
 *
 * VGRP-88: sirve para `videos` y para `materiales` (ambos se reordenan arrastrando).
 */
export async function reordenarContenido(
  admin: AdminClient,
  entidad: "videos" | "materiales",
  ids: string[],
): Promise<ResultadoMutacion<{ id: string; orden: number }[]>> {
  const { data, error: errorLectura } = await tabla(admin, entidad)
    .select("id, orden")
    .in("id", ids);
  if (errorLectura) throw errorLectura;
  const anteriores = (data ?? []) as { id: string; orden: number }[];

  const existentes = new Set(anteriores.map((v) => v.id));
  const faltante = ids.find((id) => !existentes.has(id));
  if (faltante) throw new ItemNoEncontrado(entidad, faltante);

  const asignado = asignarOrden(
    ids,
    anteriores.map((v) => v.orden),
  );
  const resultados = await Promise.all(
    ids.map((id) =>
      tabla(admin, entidad)
        .update({ orden: asignado.get(id) as number })
        .eq("id", id),
    ),
  );
  const fallo = resultados.find((r) => r.error);
  if (fallo?.error) throw fallo.error;

  const nuevo = ids.map((id) => ({ id, orden: asignado.get(id) as number }));
  return {
    resultado: nuevo,
    valorAnterior: anteriores as unknown as Json,
    valorNuevo: nuevo as unknown as Json,
    // Afecta a varios ítems a la vez: el audit log necesita un entidad_id
    // (text), así que apunta a la lista completa en vez de a uno solo.
    entidadId: "lista",
  };
}

/** Los videos siguen siendo la API de siempre (la ruta `videos/orden` y sus tests). */
export function reordenarVideos(admin: AdminClient, ids: string[]) {
  return reordenarContenido(admin, "videos", ids);
}

// -----------------------------------------------------------------------------
// VGRP-88 — materiales: el archivo vive en Storage y la fila lo referencia.
// -----------------------------------------------------------------------------

interface ArchivoGuardado {
  /** `archivos/<uuid>.<ext>`, ya movido desde `pendientes/`. */
  storagePath: string;
  extension: ExtensionMaterial;
  tipo: string;
  tamanoBytes: number;
}

/**
 * Convierte un archivo PENDIENTE (el que el admin subió directo a Storage) en uno guardado:
 * lo verifica con la metadata REAL del objeto —no la que declaró el cliente— y lo mueve a
 * `archivos/`. `tipo`, `extension` y `tamano_bytes` salen de acá, nunca del body del request.
 *
 * Un objeto que pasa el tope se borra: el bucket también lo limita (`file_size_limit`), esto
 * es la segunda barrera por si ese límite cambia o se saltea.
 */
async function prepararArchivo(pathPendiente: string): Promise<ArchivoGuardado> {
  // El schema ya lo validó con PATH_PENDIENTE_REGEX; se repite acá porque esta función es la
  // que mueve objetos del bucket y no debería confiar en que su caller lo hizo.
  if (!PATH_PENDIENTE_REGEX.test(pathPendiente)) {
    throw new ArchivoInvalido("El archivo no es válido. Volvé a subirlo.");
  }
  const extension = extensionDe(pathPendiente);
  if (!extension) throw new ArchivoInvalido("El tipo de archivo no es válido. Volvé a subirlo.");

  const objeto = await verificarObjeto(pathPendiente);
  if (!objeto) {
    throw new ArchivoInvalido("No encontramos el archivo subido. Volvé a subirlo.");
  }
  if (objeto.tamanoBytes <= 0) {
    await borrarObjeto(pathPendiente).catch(() => undefined);
    throw new ArchivoInvalido("El archivo está vacío.");
  }
  if (objeto.tamanoBytes > MAX_BYTES) {
    await borrarObjeto(pathPendiente).catch(() => undefined);
    throw new ArchivoInvalido(`El archivo supera el máximo de ${formatearTamano(MAX_BYTES)}.`);
  }

  const storagePath = await moverAArchivos(pathPendiente);
  return {
    storagePath,
    extension,
    tipo: EXTENSIONES[extension].tipo,
    tamanoBytes: objeto.tamanoBytes,
  };
}

/** Borra un objeto sin romper la operación que ya salió bien: lo que queda es un huérfano en
 *  `archivos/` que se ve en Sentry (design.md, "Open questions / risks"). */
async function borrarObjetoBestEffort(path: string, contexto: string): Promise<void> {
  try {
    await borrarObjeto(path);
  } catch (error) {
    Sentry.captureException(error, {
      level: "warning",
      tags: { "materiales-huerfano": "true" },
      extra: { path, contexto },
    });
  }
}

async function crearMaterial(admin: AdminClient, valores: unknown) {
  const { storage_path_pendiente, ...datos } = SCHEMAS.materiales.parse(valores);
  if (!storage_path_pendiente) {
    throw new ArchivoInvalido("Falta el archivo del material.");
  }

  const archivo = await prepararArchivo(storage_path_pendiente);
  try {
    const orden = datos.orden ?? (await proximoOrden(admin, "materiales"));
    const { data, error } = await admin
      .from("materiales")
      .insert({
        ...datos,
        orden,
        storage_path: archivo.storagePath,
        tipo: archivo.tipo,
        extension: archivo.extension,
        tamano_bytes: archivo.tamanoBytes,
      })
      .select()
      .single();
    if (error) throw error;

    return {
      resultado: data,
      valorAnterior: null,
      valorNuevo: data as unknown as Json,
      entidadId: data.id,
    };
  } catch (error) {
    // El archivo ya se movió: si la fila no se creó, no puede quedar suelto.
    await borrarObjetoBestEffort(archivo.storagePath, "crearMaterial: falló el insert");
    throw error;
  }
}

async function actualizarMaterial(admin: AdminClient, id: string, valores: unknown) {
  const { storage_path_pendiente, ...datos } = SCHEMAS.materiales.partial().parse(valores);

  const { data: anterior, error: errorAnterior } = await admin
    .from("materiales")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errorAnterior) throw errorAnterior;
  if (!anterior) throw new ItemNoEncontrado("materiales", id);

  // Reemplazo del archivo: la fila conserva título, descripción, orden y publicado.
  const archivo = storage_path_pendiente ? await prepararArchivo(storage_path_pendiente) : null;

  try {
    const { data, error } = await admin
      .from("materiales")
      .update({
        ...datos,
        ...(archivo && {
          storage_path: archivo.storagePath,
          tipo: archivo.tipo,
          extension: archivo.extension,
          tamano_bytes: archivo.tamanoBytes,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Recién con la fila apuntando al archivo nuevo se borra el viejo: si algo falla antes,
    // el material sigue intacto con su archivo de siempre.
    if (archivo) {
      await borrarObjetoBestEffort(anterior.storage_path, "actualizarMaterial: archivo viejo");
    }

    return {
      resultado: data,
      valorAnterior: anterior as unknown as Json,
      valorNuevo: data as unknown as Json,
      entidadId: id,
    };
  } catch (error) {
    if (archivo) {
      await borrarObjetoBestEffort(archivo.storagePath, "actualizarMaterial: falló el update");
    }
    throw error;
  }
}

async function borrarMaterial(admin: AdminClient, id: string) {
  const { data: anterior, error: errorAnterior } = await admin
    .from("materiales")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errorAnterior) throw errorAnterior;
  if (!anterior) throw new ItemNoEncontrado("materiales", id);

  // Primero la fila y después el archivo: nada referencia a un material (a diferencia de
  // `videos`, que se soft-borra por el progreso guardado), y si falla el borrado del
  // objeto la fila ya no existe, así que el usuario nunca ve un link roto.
  const { error } = await admin.from("materiales").delete().eq("id", id);
  if (error) throw error;
  await borrarObjetoBestEffort(anterior.storage_path, "borrarMaterial");

  return {
    resultado: null,
    valorAnterior: anterior as unknown as Json,
    valorNuevo: null,
    entidadId: id,
  };
}

export async function crearContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
  valores: unknown,
): Promise<ResultadoMutacion<Tables<E>>> {
  if (entidad === "materiales") {
    return crearMaterial(admin, valores) as unknown as Promise<ResultadoMutacion<Tables<E>>>;
  }
  const datos = SCHEMAS[entidad].parse(valores) as TablesInsert<E>;

  if (entidad === "videos" && (datos as { orden?: number }).orden === undefined) {
    (datos as { orden?: number }).orden = await proximoOrden(admin, "videos");
  }

  const { data, error } = await tabla(admin, entidad).insert(datos).select().single();
  if (error) throw error;

  return {
    resultado: data as Tables<E>,
    valorAnterior: null,
    valorNuevo: data as unknown as Json,
    entidadId: (data as { id: string }).id,
  };
}

export async function actualizarContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
  id: string,
  valores: unknown,
): Promise<ResultadoMutacion<Tables<E>>> {
  if (entidad === "materiales") {
    return actualizarMaterial(admin, id, valores) as unknown as Promise<
      ResultadoMutacion<Tables<E>>
    >;
  }
  const datos = SCHEMAS[entidad].partial().parse(valores) as TablesUpdate<E>;

  const { data: anterior, error: errorAnterior } = await tabla(admin, entidad)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errorAnterior) throw errorAnterior;
  if (!anterior) throw new ItemNoEncontrado(entidad, id);

  const { data, error } = await tabla(admin, entidad).update(datos).eq("id", id).select().single();
  if (error) throw error;

  return {
    resultado: data as Tables<E>,
    valorAnterior: anterior as unknown as Json,
    valorNuevo: data as unknown as Json,
    entidadId: id,
  };
}

/**
 * `videos`: SIEMPRE soft-delete (`publicado = false`), nunca DELETE real —
 * `profiles.progreso` referencia videos por id (PRD §4.1), y borrar la fila
 * rompería el progreso ya guardado de usuarios reales (requirements-vgrp38.md
 * US-5). El resto de las entidades no tiene ninguna referencia conocida desde
 * otro lado, así que un DELETE real es seguro. `materiales` además borra su
 * archivo de Storage (VGRP-88, ver `borrarMaterial`).
 */
export async function borrarContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
  id: string,
): Promise<ResultadoMutacion<Tables<E> | null>> {
  if (entidad === "videos") {
    return actualizarContenido(admin, entidad, id, { publicado: false });
  }
  if (entidad === "materiales") return borrarMaterial(admin, id);

  const { data: anterior, error: errorAnterior } = await tabla(admin, entidad)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errorAnterior) throw errorAnterior;
  if (!anterior) throw new ItemNoEncontrado(entidad, id);

  const { error } = await tabla(admin, entidad).delete().eq("id", id);
  if (error) throw error;

  return {
    resultado: null,
    valorAnterior: anterior as unknown as Json,
    valorNuevo: null,
    entidadId: id,
  };
}
