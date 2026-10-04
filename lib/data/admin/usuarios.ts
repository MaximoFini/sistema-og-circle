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
import {
  decodeCursor,
  decodeCursorEmail,
  encodeCursor,
  escaparLike,
  keysetFilter,
  keysetFilterEmail,
  valorPostgrest,
} from "./keyset";
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

  const alfabetico = orden === "alfabetico";
  const ascending = orden !== "recientes";

  let query = admin
    .from("profiles")
    .select("id, email, nivel, created_at")
    .order(alfabetico ? "email" : "created_at", { ascending })
    .order("id", { ascending })
    .limit(limit + 1);

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
  if (alfabetico) {
    const c = decodeCursorEmail(cursor);
    if (c) query = query.or(keysetFilterEmail(c));
  } else {
    const keyset = decodeCursor(cursor);
    if (keyset) query = query.or(keysetFilter(keyset, ascending ? "asc" : "desc"));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as UsuarioListado[];
  const hasMore = rows.length > limit;
  const usuarios = hasMore ? rows.slice(0, limit) : rows;

  const ultima = usuarios.at(-1);
  const nextCursor =
    hasMore && ultima
      ? encodeCursor(
          alfabetico
            ? { email: ultima.email, id: ultima.id }
            : { createdAt: ultima.created_at, id: ultima.id },
        )
      : null;

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
  /** `perfil.progreso.videosVistos` guarda sólo uuids: acá ya traducidos. */
  progreso: ProgresoVideos;
}

export interface ProgresoVideos {
  /** Vistos que siguen existiendo, en el orden del catálogo (stage, orden). */
  vistos: Pick<Tables<"videos">, "titulo" | "publicado">[];
  /** Vistos cuyo video ya se borró. */
  eliminados: number;
  totalPublicados: number;
}

// `progreso` es jsonb libre; hoy la única forma que escribe la app es
// `{ videosVistos: uuid[] }` (components/video/_actions.ts).
function leerVideosVistos(progreso: Json): string[] {
  const v =
    progreso && typeof progreso === "object" && !Array.isArray(progreso)
      ? progreso.videosVistos
      : undefined;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
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

  const idsVistos = leerVideosVistos(perfil.progreso);

  // Las consultas son independientes entre sí (ya sabemos que el usuario
  // existe): en paralelo. De `videos` sólo se traen los vistos (y nada si no
  // vio ninguno) más el conteo de publicados, no el catálogo entero.
  const [nivelRes, pagosRes, overridesRes, vistosRes, publicadosRes] = await Promise.all([
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
    idsVistos.length > 0
      ? admin
          .from("videos")
          .select("titulo, publicado")
          .in("id", idsVistos)
          .order("stage", { ascending: true })
          .order("orden", { ascending: true })
      : { data: [], error: null },
    idsVistos.length > 0
      ? admin.from("videos").select("id", { count: "exact", head: true }).eq("publicado", true)
      : { count: 0, error: null },
  ]);
  if (nivelRes.error) throw nivelRes.error;
  if (pagosRes.error) throw pagosRes.error;
  if (overridesRes.error) throw overridesRes.error;
  if (vistosRes.error) throw vistosRes.error;
  if (publicadosRes.error) throw publicadosRes.error;
  const vistos = vistosRes.data ?? [];
  const { data: nivelActivo } = nivelRes;
  const { data: pagos } = pagosRes;
  const { data: overrides } = overridesRes;

  return {
    perfil,
    nivelActivo: nivelActivo ?? "ninguno",
    pagos: pagos ?? [],
    overrides: overrides ?? [],
    progreso: {
      vistos,
      eliminados: new Set(idsVistos).size - vistos.length,
      totalPublicados: publicadosRes.count ?? 0,
    },
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
