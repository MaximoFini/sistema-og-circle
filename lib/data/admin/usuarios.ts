// =============================================================================
// VGRP-36 / Bloque 5 — Capa de datos del panel de admin para usuarios.
//
// Mismo patrón que `lib/data/pagos.ts` y `lib/data/admin/audit-log.ts`: el
// cliente Supabase se INYECTA como parámetro (no se crea acá dentro) — así
// estos helpers son testeables con `createTestAdminClient()` y no arrastran
// `import "server-only"` a los tests. El `import "server-only"` de acá igual
// protege el bundle de cliente en el build real de Next.
//
// TODAS las consultas van por service role (bypassan RLS): la barrera de
// autorización es 100% el check de rol de la capa de ruta (middleware + layout
// + `requireAdmin()`), ver design.md §"Sanitización de acceso admin en la capa
// de datos".
// =============================================================================

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  Constants,
  type Database,
  type Json,
  type NivelAcceso,
  type Tables,
} from "../../database.types";
import { proyectarNivel } from "../pagos";
import { decodeCursor, encodeCursor, escaparLike, keysetFilter, valorPostgrest } from "./keyset";
import { PAGOS_COLUMNAS_RESUMEN, type PagoResumen } from "./pagos";

type AdminClient = SupabaseClient<Database>;

export type Profile = Tables<"profiles">;
export type NivelOverride = Tables<"nivel_overrides">;

// Fuente de verdad única de los valores del enum `nivel_acceso` — generada por
// el MCP de Supabase junto con los tipos. No re-declarar la tupla a mano.
const NIVELES = Constants.public.Enums.nivel_acceso;

/** El `:id` es un uuid pero no corresponde a ninguna fila de `profiles`. El
 *  handler la mapea a `404` SIN escribir audit log (requirements.md US-4). */
export class UsuarioNoEncontrado extends Error {
  constructor(userId: string) {
    super(`No existe un usuario con id ${userId}.`);
    this.name = "UsuarioNoEncontrado";
  }
}

// -----------------------------------------------------------------------------
// listarUsuarios
// -----------------------------------------------------------------------------

// `desde`/`hasta` esperan un datetime ISO completo: la página convierte el
// yyyy-mm-dd del querystring (mismo patrón que `filtrosPagosSchema`).
export const ORDENES_USUARIOS = ["recientes", "antiguos", "alfabetico"] as const;
export type OrdenUsuarios = (typeof ORDENES_USUARIOS)[number];

export const filtrosUsuariosSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  nivel: z.enum(NIVELES).optional(),
  rol: z.enum(Constants.public.Enums.rol_usuario).optional(),
  terminos: z.enum(["si", "no"]).optional(),
  desde: z.iso.datetime().optional(),
  hasta: z.iso.datetime().optional(),
  orden: z.enum(ORDENES_USUARIOS).default("recientes"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type FiltrosUsuarios = z.input<typeof filtrosUsuariosSchema>;

export interface UsuarioListado {
  id: string;
  email: string;
  nivel: NivelAcceso;
  created_at: string;
}

export interface ListarUsuariosResultado {
  usuarios: UsuarioListado[];
  nextCursor: string | null;
}

// Cursor del orden alfabético: `(email, id)` en vez de `(created_at, id)` —
// `profiles.email` no es UNIQUE, el `id` desempata. Mismo formato opaco
// (base64url) que el cursor de keyset.ts; uno malformado se ignora.
const cursorEmailSchema = z.object({
  email: z.string().min(1).max(320),
  id: z.uuid(),
});

function decodeCursorEmail(cursor: string | undefined): z.infer<typeof cursorEmailSchema> | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = cursorEmailSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursorEmail(c: z.infer<typeof cursorEmailSchema>): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

/**
 * Lista `profiles` con paginación KEYSET (cursor) — nunca offset. Orden
 * `recientes` (`created_at desc, id desc`, default), `antiguos` (asc) o
 * `alfabetico` (`email asc, id asc`). Búsqueda parcial (`ilike '%q%'`) por
 * email, nombre o teléfono resuelta EN LA BASE (US-3: la búsqueda no filtra en
 * cliente, no expone filas que no matchean). Filtros opcionales por `nivel`,
 * `rol`, términos aceptados y rango de alta.
 */
export async function listarUsuarios(
  admin: AdminClient,
  filtros: FiltrosUsuarios,
): Promise<ListarUsuariosResultado> {
  const { q, nivel, rol, terminos, desde, hasta, orden, limit, cursor } =
    filtrosUsuariosSchema.parse(filtros);

  let query = admin.from("profiles").select("id, email, nivel, created_at");

  if (orden === "alfabetico") {
    query = query.order("email", { ascending: true }).order("id", { ascending: true });
  } else {
    const ascending = orden === "antiguos";
    query = query.order("created_at", { ascending }).order("id", { ascending });
  }
  query = query.limit(limit + 1);

  if (q) {
    const patron = valorPostgrest(`%${escaparLike(q)}%`);
    query = query.or(`email.ilike.${patron},nombre.ilike.${patron},telefono.ilike.${patron}`);
  }
  if (nivel) query = query.eq("nivel", nivel);
  if (rol) query = query.eq("rol", rol);
  if (terminos === "si") query = query.not("terminos_aceptados_at", "is", null);
  if (terminos === "no") query = query.is("terminos_aceptados_at", null);
  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", hasta);

  // Cada `.or()` va como un parámetro `or=` aparte y PostgREST los combina con
  // AND: el de búsqueda y el de keyset no se pisan.
  if (orden === "alfabetico") {
    const c = decodeCursorEmail(cursor);
    if (c) {
      const email = valorPostgrest(c.email);
      query = query.or(`email.gt.${email},and(email.eq.${email},id.gt.${c.id})`);
    }
  } else {
    const keyset = decodeCursor(cursor);
    if (keyset) query = query.or(keysetFilter(keyset, orden === "antiguos" ? "asc" : "desc"));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as UsuarioListado[];
  const hasMore = rows.length > limit;
  const usuarios = hasMore ? rows.slice(0, limit) : rows;

  const ultima = usuarios.at(-1);
  let nextCursor: string | null = null;
  if (hasMore && ultima) {
    nextCursor =
      orden === "alfabetico"
        ? encodeCursorEmail({ email: ultima.email, id: ultima.id })
        : encodeCursor({ createdAt: ultima.created_at, id: ultima.id });
  }

  return { usuarios, nextCursor };
}

// -----------------------------------------------------------------------------
// obtenerUsuario
// -----------------------------------------------------------------------------

export interface UsuarioDetalle {
  perfil: Profile;
  nivelActivo: NivelAcceso;
  pagos: PagoResumen[];
  overrides: NivelOverride[];
  /** Catálogo de videos (id + título) para traducir `perfil.progreso.videosVistos`
   *  — que guarda sólo uuids — a algo legible en la ficha. */
  videos: Pick<Tables<"videos">, "id" | "titulo" | "publicado">[];
}

/**
 * Ficha completa de un usuario: perfil, nivel vigente (RPC `nivel_vigente`),
 * ledger completo de pagos (`order by created_at desc`) e historial de
 * overrides manuales. `id` que no matchea ninguna fila -> `null` (la página
 * hace `notFound()` — US-3: 404).
 */
export async function obtenerUsuario(
  admin: AdminClient,
  id: string,
): Promise<UsuarioDetalle | null> {
  const { data: perfil, error: perfilError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (perfilError) throw perfilError;
  if (!perfil) return null;

  // Las tres consultas son independientes entre sí (ya sabemos que el usuario
  // existe): en paralelo.
  const [nivelRes, pagosRes, overridesRes, videosRes] = await Promise.all([
    admin.rpc("nivel_vigente", { p_user_id: id }),
    // VGRP-54 punto 9 — PAGOS_COLUMNAS_RESUMEN excluye `payload_raw` (JSON
    // crudo de Mercado Pago, varios KB por fila; la ficha no lo muestra).
    // `.limit(50)`: esto es un ledger append-only, un usuario activo puede
    // acumular filas sin techo.
    admin
      .from("pagos")
      .select(PAGOS_COLUMNAS_RESUMEN)
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("nivel_overrides")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("videos")
      .select("id, titulo, publicado")
      .order("stage", { ascending: true })
      .order("orden", { ascending: true }),
  ]);
  if (nivelRes.error) throw nivelRes.error;
  if (pagosRes.error) throw pagosRes.error;
  if (overridesRes.error) throw overridesRes.error;
  if (videosRes.error) throw videosRes.error;
  const { data: nivelActivo } = nivelRes;
  const { data: pagos } = pagosRes;
  const { data: overrides } = overridesRes;

  return {
    perfil,
    nivelActivo: nivelActivo ?? "ninguno",
    pagos: pagos ?? [],
    overrides: overrides ?? [],
    videos: videosRes.data ?? [],
  };
}

// -----------------------------------------------------------------------------
// activarNivel — reutiliza `proyectarNivel` de lib/data/pagos.ts
// -----------------------------------------------------------------------------

export interface ActivarNivelParams {
  userId: string;
  nivel: NivelAcceso;
  motivo: string;
  actorId: string;
}

export interface ActivarNivelResultado {
  resultado: { nivelAnterior: NivelAcceso; nivelNuevo: NivelAcceso };
  valorAnterior: Json;
  valorNuevo: Json;
}

/**
 * Fija/cambia el nivel de un usuario a mano. NO reimplementa la proyección:
 * inserta una fila en `nivel_overrides` y delega en `proyectarNivel` (la misma
 * función que usa el webhook de Mercado Pago) para recalcular desde
 * ledger + overrides y reflejarlo en `profiles.nivel` + `app_metadata`.
 *
 * Devuelve la forma `{ resultado, valorAnterior, valorNuevo }` que
 * `conAuditoria()` espera — y NO escribe `profiles`/`pagos` fuera del closure
 * que `conAuditoria` ejecuta (garantía estructural de que toda mutación pasa
 * por la auditoría).
 *
 * - NUNCA consulta `pagos` (US-4: funciona sin ningún pago de MP —
 *   transferencia / USDT de Fase 3).
 * - Idempotente: fijar el mismo nivel dos veces inserta dos overrides,
 *   `proyectarNivel` recalcula igual y `nivelAnterior == nivelNuevo`.
 *
 * `nivelAnterior` sale de `profiles.nivel` (la proyección ya materializada),
 * no de un `nivel_vigente()` fresco — es lo que pide design.md §activarNivel
 * paso 1 y lo que ve el resto de la app (claim, gating). En operación normal
 * `profiles.nivel` está sincronizado porque tanto el webhook como esta función
 * llaman a `proyectarNivel` tras cada cambio.
 */
export async function activarNivel(
  admin: AdminClient,
  params: ActivarNivelParams,
): Promise<ActivarNivelResultado> {
  const { userId, nivel, motivo, actorId } = params;

  const { data: perfil, error: perfilError } = await admin
    .from("profiles")
    .select("nivel")
    .eq("id", userId)
    .maybeSingle();
  if (perfilError) throw perfilError;
  if (!perfil) throw new UsuarioNoEncontrado(userId);

  const nivelAnterior = perfil.nivel;

  const { error: insertError } = await admin
    .from("nivel_overrides")
    .insert({ user_id: userId, nivel, motivo, actor_id: actorId });
  if (insertError) throw insertError;

  const nivelNuevo = await proyectarNivel(admin, userId);

  return {
    resultado: { nivelAnterior, nivelNuevo },
    valorAnterior: { nivel: nivelAnterior },
    valorNuevo: { nivel: nivelNuevo, motivo },
  };
}
