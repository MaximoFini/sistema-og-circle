// =============================================================================
// VGRP-35 / Bloque 5 — Audit log del panel de admin.
//
// El ÚNICO helper de escritura de `admin_audit_log`: toda mutación del panel
// (cambio de nivel, reproceso de pago, y cualquier futura) está obligada a
// pasar por `conAuditoria()`. Ningún handler escribe la tabla ad-hoc
// (requirements.md US-2).
//
// Mismo patrón que `lib/data/pagos.ts`: el cliente Supabase se INYECTA como
// parámetro (no se crea acá dentro) — así estos helpers son testeables con
// `createTestAdminClient()` y no arrastran `import "server-only"` a los tests.
// El `import "server-only"` de acá igual protege el bundle de cliente en el
// build real de Next.
// =============================================================================

import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "../../database.types";

type AdminClient = SupabaseClient<Database>;

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

/** Acciones de admin conocidas hoy (VGRP-36 `cambiar_nivel`, VGRP-37
 *  `reprocesar_pago`). En la tabla `accion`/`entidad` son texto libre; estos
 *  campos quedan como `string` para no acoplar este helper a cada mutación. */
export interface AuditoriaMeta {
  actorId: string;
  accion: string;
  entidad: string;
  entidadId: string;
}

export interface EntradaAudit extends AuditoriaMeta {
  valorAnterior: Json | null;
  valorNuevo: Json | null;
}

/**
 * Inserta una fila en `admin_audit_log`. Propaga (throw) cualquier error de
 * Postgres — no hay interpretación de negocio acá.
 */
export async function registrarAccionAdmin(admin: AdminClient, e: EntradaAudit): Promise<void> {
  const { error } = await admin.from("admin_audit_log").insert({
    actor_id: e.actorId,
    accion: e.accion,
    entidad: e.entidad,
    entidad_id: e.entidadId,
    valor_anterior: e.valorAnterior,
    valor_nuevo: e.valorNuevo,
  });
  if (error) throw error;
}

export interface ResultadoMutacion<T> {
  resultado: T;
  valorAnterior: Json | null;
  valorNuevo: Json | null;
}

/**
 * Wrapper OBLIGATORIO de toda mutación del panel.
 *
 * 1. Corre `mutacion()`.
 * 2. Si `mutacion()` **tira** -> propaga el error y NO escribe audit log
 *    (US-2: no se auditan intentos fallidos).
 * 3. Si tiene éxito -> escribe la fila de auditoría con el
 *    `valorAnterior`/`valorNuevo` que devolvió la mutación y retorna
 *    `resultado`.
 * 4. Si el insert de auditoría falla DESPUÉS de una mutación exitosa (punto
 *    de diseño 5): NO se revierte (imposible — `proyectarNivel` llama a la
 *    Admin API de Auth, fuera de una transacción PG) y NO se le devuelve
 *    error al admin (el nivel/pago ya cambió). Se reporta a Sentry con
 *    severidad alta y tag `admin-audit-gap` — un hueco de auditoría es un
 *    incidente, no un error de request. Ver docs/OBSERVABILIDAD.md.
 */
export async function conAuditoria<T>(
  admin: AdminClient,
  meta: AuditoriaMeta,
  mutacion: () => Promise<ResultadoMutacion<T>>,
): Promise<T> {
  // Si esto tira, se propaga tal cual: NO se escribe nada en admin_audit_log.
  const { resultado, valorAnterior, valorNuevo } = await mutacion();

  try {
    await registrarAccionAdmin(admin, { ...meta, valorAnterior, valorNuevo });
  } catch (error) {
    // Best-effort: la mutación de negocio YA ocurrió y no es reversible acá.
    // Fail-open: sin SENTRY_DSN, `captureException` es un no-op (ver
    // instrumentation.ts) y no rompe el flujo.
    Sentry.captureException(error, {
      level: "error",
      tags: { "admin-audit-gap": "true" },
      extra: {
        detalle:
          "El insert de admin_audit_log falló DESPUÉS de una mutación de admin exitosa. " +
          "Hueco de auditoría — la mutación NO se revirtió.",
        meta,
      },
    });
  }

  return resultado;
}

// -----------------------------------------------------------------------------
// Lectura — pantalla de auditoría
// -----------------------------------------------------------------------------

// Zod de los filtros de `listarAuditLog`. `listarAuditLog` lo aplica él mismo
// sobre lo que reciba (defensa en profundidad) — la página igual valida sus
// `searchParams` aparte porque llegan en otra forma (fechas `YYYY-MM-DD`, no
// ISO datetime) y necesita distinguir "filtro inválido" para el mensaje.
export const filtrosAuditSchema = z.object({
  actorId: z.uuid().optional(),
  actorIds: z.array(z.uuid()).optional(),
  desde: z.iso.datetime().optional(),
  hasta: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type FiltrosAudit = z.input<typeof filtrosAuditSchema>;

export interface AuditRow {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  valorAnterior: Json | null;
  valorNuevo: Json | null;
  createdAt: string;
}

export interface ListarAuditResultado {
  filas: AuditRow[];
  nextCursor: string | null;
}

interface CursorKeyset {
  createdAt: string;
  id: string;
}

const cursorSchema = z.object({
  // Se validan estrictamente ANTES de interpolarse en el filtro `.or()` de
  // PostgREST: `createdAt` como ISO datetime, `id` como uuid. Un cursor
  // fabricado con otra cosa (intento de inyectar operadores PostgREST en el
  // OR) no pasa el schema -> se ignora (arranca desde el principio).
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

/** Cursor opaco: base64url de `{ createdAt, id }`. Malformado o con valores
 *  fuera de forma -> `null` (se ignora). */
function decodeCursor(cursor: string | undefined): CursorKeyset | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(k: CursorKeyset): string {
  return Buffer.from(JSON.stringify(k), "utf8").toString("base64url");
}

interface AuditDbRow {
  id: string;
  actor_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  valor_anterior: Json | null;
  valor_nuevo: Json | null;
  created_at: string;
  profiles: { email: string | null } | null;
}

/**
 * Lista `admin_audit_log` ordenada `created_at desc, id desc`, con paginación
 * KEYSET (cursor) — nunca offset. Filtro opcional por actor y por rango de
 * `created_at`. Join opcional a `profiles` para el email del actor.
 *
 * Valida `filtros` con `filtrosAuditSchema` acá dentro (defensa en
 * profundidad). Un cursor malformado, o con valores fuera de forma, se IGNORA
 * (arranca desde el principio) — nunca 500.
 */
export async function listarAuditLog(
  admin: AdminClient,
  filtros: FiltrosAudit,
): Promise<ListarAuditResultado> {
  const { actorId, actorIds, desde, hasta, limit, cursor } = filtrosAuditSchema.parse(filtros);

  let query = admin
    .from("admin_audit_log")
    .select(
      "id, actor_id, accion, entidad, entidad_id, valor_anterior, valor_nuevo, created_at, profiles:actor_id(email)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    // +1 para saber si hay página siguiente sin un count aparte.
    .limit(limit + 1);

  // `actorIds` (varios matches de una búsqueda de email) tiene prioridad sobre
  // `actorId` (uno solo). Ambos usan `admin_audit_log_actor_created_idx`.
  if (actorIds && actorIds.length > 0) query = query.in("actor_id", actorIds);
  else if (actorId) query = query.eq("actor_id", actorId);
  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", hasta);

  const keyset = decodeCursor(cursor);
  if (keyset) {
    // (created_at, id) < (cursor.createdAt, cursor.id) en orden desc.
    query = query.or(
      `created_at.lt.${keyset.createdAt},and(created_at.eq.${keyset.createdAt},id.lt.${keyset.id})`,
    );
  }

  const { data, error } = await query.returns<AuditDbRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const visibles = hasMore ? rows.slice(0, limit) : rows;

  const filas: AuditRow[] = visibles.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorEmail: r.profiles?.email ?? null,
    accion: r.accion,
    entidad: r.entidad,
    entidadId: r.entidad_id,
    valorAnterior: r.valor_anterior,
    valorNuevo: r.valor_nuevo,
    createdAt: r.created_at,
  }));

  const ultima = visibles.at(-1);
  const nextCursor =
    hasMore && ultima ? encodeCursor({ createdAt: ultima.created_at, id: ultima.id }) : null;

  return { filas, nextCursor };
}
