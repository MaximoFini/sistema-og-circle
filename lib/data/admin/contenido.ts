// =============================================================================
// VGRP-38 / Bloque 7 — Capa de datos del CRUD de contenido (agentes, videos,
// profesionales, servicios_financieros).
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

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  Constants,
  type Database,
  type Json,
  type Tables,
  type TablesInsert,
  type TablesUpdate,
} from "../../database.types";
import type { ResultadoMutacion } from "./audit-log";

type AdminClient = SupabaseClient<Database>;

const NIVELES = Constants.public.Enums.nivel_acceso;

export const ENTIDADES = ["agentes", "videos", "profesionales", "servicios_financieros"] as const;
export type Entidad = (typeof ENTIDADES)[number];

export function esEntidadValida(valor: string): valor is Entidad {
  return (ENTIDADES as readonly string[]).includes(valor);
}

/** El campo que representa "visible/vigente" difiere por entidad: `videos`
 *  usa `publicado`, el resto usa `activo`. Un solo lugar que lo sepa. */
export function campoVigencia(entidad: Entidad): "activo" | "publicado" {
  return entidad === "videos" ? "publicado" : "activo";
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
};

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
  nivel_requerido: z.enum(NIVELES),
  contacto: z.string().trim().min(1).nullable().optional(),
  orden: z.number().int(),
  activo: z.boolean(),
});

const videoSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2)]),
  titulo: z.string().trim().min(1),
  descripcion: z.string().trim().nullable().optional(),
  // SENSIBLE — igual pasa por acá porque el admin SÍ puede cargar/editarlo;
  // lo que nunca debe pasar es que este valor llegue a un cliente sin nivel
  // (VGRP-30, resolverSecreto()) o a un video con publicado=false.
  provider_ref: z.string().trim().nullable().optional(),
  // Ver comment de columna en la migración: existe por paridad de schema,
  // VGRP-29 documenta que no se aplica gating real sobre la formación.
  nivel_requerido: z.enum(NIVELES),
  orden: z.number().int(),
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
  nivel_requerido: z.enum(NIVELES),
  orden: z.number().int(),
  activo: z.boolean(),
});

const SCHEMAS = {
  agentes: agenteSchema,
  videos: videoSchema,
  profesionales: profesionalSchema,
  servicios_financieros: servicioFinancieroSchema,
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
  const { data, error } = await tabla(admin, entidad)
    .select("*")
    .order("orden", { ascending: true });
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
export async function crearContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
  valores: unknown,
): Promise<ResultadoMutacion<Tables<E>>> {
  const datos = SCHEMAS[entidad].parse(valores) as TablesInsert<E>;

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
 * otro lado, así que un DELETE real es seguro.
 */
export async function borrarContenido<E extends Entidad>(
  admin: AdminClient,
  entidad: E,
  id: string,
): Promise<ResultadoMutacion<Tables<E> | null>> {
  if (entidad === "videos") {
    return actualizarContenido(admin, entidad, id, { publicado: false });
  }

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
