// =============================================================================
// VGRP-37 / Bloque 5 — Capa de datos del panel de admin para el ledger de pagos.
//
// OJO: NO es `lib/data/pagos.ts` — ese es el módulo compartido con el webhook de
// Mercado Pago y NO se toca. Este módulo es sólo lectura del ledger + el
// reproceso (que REUTILIZA `proyectarNivel` de `lib/data/pagos.ts`, sin
// reimplementar nada ni insertar filas).
//
// Mismo patrón que `lib/data/admin/usuarios.ts`: el cliente Supabase se INYECTA
// como parámetro (no se crea acá dentro) — testeable con `createTestAdminClient()`
// sin arrastrar `import "server-only"` a los tests. El `import "server-only"` de
// acá igual protege el bundle de cliente en el build real de Next.
//
// TODAS las consultas van por service role (bypassan RLS): la barrera de
// autorización es 100% el check de rol de la capa de ruta (middleware + layout +
// `requireAdmin()`), ver design.md §"Sanitización de acceso admin en la capa de
// datos".
// =============================================================================

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json, NivelAcceso, Tables } from "../../database.types";
import { proyectarNivel } from "../pagos";
import { decodeCursor, encodeCursor, escaparLike, keysetFilter } from "./keyset";

type AdminClient = SupabaseClient<Database>;

export type PagoRow = Tables<"pagos">;

/** El `:id` es un uuid pero no corresponde a ninguna fila de `pagos`. El
 *  handler la mapea a `404` SIN escribir audit log (requirements.md US-6). */
export class PagoNoEncontrado extends Error {
  constructor(pagoId: string) {
    super(`No existe un pago con id ${pagoId}.`);
    this.name = "PagoNoEncontrado";
  }
}

/** El pago existe pero su `estado` no es `approved`: no se puede reprocesar. El
 *  handler la mapea a `409` SIN audit log y SIN cambios (requirements.md US-6). */
export class PagoNoReprocesable extends Error {
  constructor(estado: string) {
    super(`Sólo se puede reprocesar un pago aprobado (estado actual: ${estado}).`);
    this.name = "PagoNoReprocesable";
  }
}

// -----------------------------------------------------------------------------
// sanitizarPayloadRaw — allowlist + redacción defensiva (design.md §sanitizarPayloadRaw)
// -----------------------------------------------------------------------------

// Los ~14 campos de diagnóstico conocidos del objeto `pago` de la API de Mercado
// Pago. Cualquier campo NUEVO del lado de MP (que podría traer un dato sensible a
// futuro) se descarta por no estar acá — allowlist, no denylist.
const CAMPOS_VISIBLES = [
  "id",
  "status",
  "status_detail",
  "date_created",
  "date_approved",
  "date_last_updated",
  "payment_method_id",
  "payment_type_id",
  "transaction_amount",
  "currency_id",
  "external_reference",
  "description",
  "live_mode",
  "metadata",
] as const;

// De `payer` sólo pasa un subconjunto — nunca datos de tarjeta ni tokens.
const PAYER_VISIBLE = ["email", "identification"] as const;

// Segunda pasada defensiva: cualquier clave (a cualquier profundidad del objeto
// YA filtrado) que matchee esto se reemplaza por "[redactado]". Cubre, p. ej.,
// una clave sensible que aparezca ANIDADA dentro de `metadata` (que es un objeto
// libre del lado de MP).
const CLAVE_SENSIBLE = /token|secret|password|authorization|signature|api[_-]?key/i;

function esObjetoPlano(v: unknown): v is Record<string, Json | undefined> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Redacta recursivamente toda clave sensible de un valor JSON ya filtrado. */
function redactarClavesSensibles(valor: Json): Json {
  if (Array.isArray(valor)) return valor.map(redactarClavesSensibles);
  if (esObjetoPlano(valor)) {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(valor)) {
      if (v === undefined) continue;
      out[k] = CLAVE_SENSIBLE.test(k) ? "[redactado]" : redactarClavesSensibles(v);
    }
    return out;
  }
  return valor;
}

/**
 * Filtra `payload_raw` para la vista de detalle de un pago: sólo pasan los
 * campos de `CAMPOS_VISIBLES` (y `payer` recortado a `PAYER_VISIBLE`); todo lo
 * demás — `card`, `token`, credenciales, cualquier clave nueva de MP — se
 * descarta. Después, una segunda pasada redacta cualquier clave sensible que
 * haya quedado anidada. Función pura, sin I/O.
 */
export function sanitizarPayloadRaw(raw: Json | null | undefined): Json {
  if (!esObjetoPlano(raw)) return {};

  const filtrado: Record<string, Json> = {};
  for (const campo of CAMPOS_VISIBLES) {
    const v = raw[campo];
    if (v !== undefined) filtrado[campo] = v;
  }

  const payer = raw.payer;
  if (esObjetoPlano(payer)) {
    const payerFiltrado: Record<string, Json> = {};
    for (const campo of PAYER_VISIBLE) {
      const v = payer[campo];
      if (v !== undefined) payerFiltrado[campo] = v;
    }
    filtrado.payer = payerFiltrado;
  }

  return redactarClavesSensibles(filtrado);
}

// -----------------------------------------------------------------------------
// listarPagos — consulta la vista `admin_pagos_ledger`
// -----------------------------------------------------------------------------

// `desde`/`hasta` esperan un datetime ISO completo, NO el `z.iso.date()`
// (yyyy-mm-dd) que valida el querystring en app/admin/pagos/page.tsx: esa
// página convierte a `${fecha}T00:00:00.000Z` / `${fecha}T23:59:59.999Z`
// antes de llamar acá (mismo patrón en app/admin/auditoria/page.tsx). Esta
// capa valida el resultado YA convertido, no el input crudo del usuario.
export const filtrosPagosSchema = z.object({
  estado: z.string().trim().min(1).max(50).optional(),
  desde: z.iso.datetime().optional(),
  hasta: z.iso.datetime().optional(),
  proveedorRef: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type FiltrosPagos = z.input<typeof filtrosPagosSchema>;

/** Conteo global de pagos aprobados sin aplicar (sólo `where sin_aplicar`, sin
 *  filtros ni paginación). Lo usan el callout del índice (37-T11) y `listarPagos`
 *  para el badge del ledger. Barato: la tabla es chica. */
export async function contarPagosSinAplicar(admin: AdminClient): Promise<number> {
  const { count, error } = await admin
    .from("admin_pagos_ledger")
    .select("id", { count: "exact", head: true })
    .eq("sin_aplicar", true);
  if (error) throw error;
  return count ?? 0;
}

export interface PagoLedgerRow {
  id: string;
  user_id: string;
  proveedor: string;
  proveedor_ref: string;
  nivel_comprado: NivelAcceso;
  monto_ars: number;
  estado: string;
  created_at: string;
  user_email: string;
  user_nivel_actual: NivelAcceso;
  sin_aplicar: boolean;
}

export interface ListarPagosResultado {
  pagos: PagoLedgerRow[];
  nextCursor: string | null;
  /** `null` en páginas con cursor (VGRP-54 punto 7: no se recalcula) — nunca
   * un `0` ambiguo con "de verdad no hay pagos sin aplicar". El caller decide
   * qué mostrar según si es la primera página, no según el valor. */
  totalSinAplicar: number | null;
}

interface LedgerDbRow {
  id: string | null;
  user_id: string | null;
  proveedor: string | null;
  proveedor_ref: string | null;
  nivel_comprado: NivelAcceso | null;
  monto_ars: number | null;
  estado: string | null;
  created_at: string | null;
  user_email: string | null;
  user_nivel_actual: NivelAcceso | null;
  sin_aplicar: boolean | null;
}

function normalizarFila(r: LedgerDbRow): PagoLedgerRow {
  return {
    id: r.id ?? "",
    user_id: r.user_id ?? "",
    proveedor: r.proveedor ?? "",
    proveedor_ref: r.proveedor_ref ?? "",
    nivel_comprado: r.nivel_comprado ?? "ninguno",
    monto_ars: r.monto_ars ?? 0,
    estado: r.estado ?? "",
    created_at: r.created_at ?? "",
    user_email: r.user_email ?? "",
    user_nivel_actual: r.user_nivel_actual ?? "ninguno",
    sin_aplicar: r.sin_aplicar ?? false,
  };
}

/**
 * Lista `admin_pagos_ledger` ordenada `created_at desc, id desc`, con paginación
 * KEYSET (cursor) — nunca offset. Filtros opcionales: `estado` (exacto), rango de
 * `created_at` (`desde`/`hasta`, ISO datetime) y `proveedorRef` (`ilike` parcial,
 * más útil para diagnóstico). `totalSinAplicar` es un `count` aparte (sólo
 * `where sin_aplicar`, sin los otros filtros ni paginación) para el badge del
 * índice — barato, la tabla es chica.
 */
export async function listarPagos(
  admin: AdminClient,
  filtros: FiltrosPagos,
): Promise<ListarPagosResultado> {
  const { estado, desde, hasta, proveedorRef, limit, cursor } = filtrosPagosSchema.parse(filtros);

  let query = admin
    .from("admin_pagos_ledger")
    .select(
      "id, user_id, proveedor, proveedor_ref, nivel_comprado, monto_ars, estado, created_at, user_email, user_nivel_actual, sin_aplicar",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (estado) query = query.eq("estado", estado);
  if (desde) query = query.gte("created_at", desde);
  if (hasta) query = query.lte("created_at", hasta);
  if (proveedorRef) query = query.ilike("proveedor_ref", `%${escaparLike(proveedorRef)}%`);

  const keyset = decodeCursor(cursor);
  if (keyset) query = query.or(keysetFilter(keyset));

  // VGRP-54 punto 7 — contarPagosSinAplicar() es cara: `sin_aplicar` es una
  // columna calculada con dos NOT EXISTS correlacionados (ver el comentario de
  // la vista), así que el count materializa la vista entera. El número que se
  // muestra no cambia (es el mismo total en cualquier página), pero no hace
  // falta recalcularlo en cada página siguiente del mismo listado — sólo en
  // la primera (sin cursor). El listado y el conteo, cuando corre, van en
  // paralelo (son independientes entre sí).
  const [{ data, error }, totalSinAplicar] = await Promise.all([
    query.returns<LedgerDbRow[]>(),
    keyset ? Promise.resolve(null) : contarPagosSinAplicar(admin),
  ]);
  if (error) throw error;

  const rows = (data ?? []).map(normalizarFila);
  const hasMore = rows.length > limit;
  const pagos = hasMore ? rows.slice(0, limit) : rows;

  const ultima = pagos.at(-1);
  const nextCursor =
    hasMore && ultima ? encodeCursor({ createdAt: ultima.created_at, id: ultima.id }) : null;

  return { pagos, nextCursor, totalSinAplicar };
}

// -----------------------------------------------------------------------------
// obtenerPago
// -----------------------------------------------------------------------------

export interface PagoDetalle {
  pago: PagoRow;
  payloadRawSanitizado: Json;
  sinAplicar: boolean;
  userEmail: string;
}

/**
 * Detalle de un pago para la vista `/admin/pagos/[id]`: la fila cruda de `pagos`,
 * su `payload_raw` FILTRADO (`sanitizarPayloadRaw`), el flag `sinAplicar` y el
 * email del usuario (de la vista `admin_pagos_ledger`). `id` que no matchea
 * ninguna fila -> `null` (la página hace `notFound()` — US-5: 404).
 */
export async function obtenerPago(admin: AdminClient, id: string): Promise<PagoDetalle | null> {
  // VGRP-54 punto 6 — las dos consultas son por el mismo `id` y ninguna
  // depende del resultado de la otra: el `if (!pago) return null` de abajo es
  // sólo para el 404 (US-5), así que se puede chequear DESPUÉS del
  // Promise.all. En el caso 404 se descarta el resultado de `ledger`, pero es
  // más barato que pagar los dos viajes en serie en el caso común (existe).
  const [{ data: pago, error: pagoError }, { data: ledger, error: ledgerError }] =
    await Promise.all([
      admin.from("pagos").select("*").eq("id", id).maybeSingle(),
      admin.from("admin_pagos_ledger").select("sin_aplicar, user_email").eq("id", id).maybeSingle(),
    ]);
  if (pagoError) throw pagoError;
  if (ledgerError) throw ledgerError;
  if (!pago) return null;

  return {
    pago,
    payloadRawSanitizado: sanitizarPayloadRaw(pago.payload_raw),
    sinAplicar: ledger?.sin_aplicar ?? false,
    userEmail: ledger?.user_email ?? "",
  };
}

// -----------------------------------------------------------------------------
// reprocesarPago — reutiliza `proyectarNivel` de lib/data/pagos.ts
// -----------------------------------------------------------------------------

export interface ReprocesarPagoParams {
  pagoId: string;
  actorId: string;
}

export interface ReprocesarPagoResultado {
  resultado: { nivelAnterior: NivelAcceso; nivelNuevo: NivelAcceso };
  valorAnterior: Json;
  valorNuevo: Json;
}

/**
 * Reprocesa un pago aprobado que no se aplicó: vuelve a proyectar el nivel del
 * usuario dueño del pago con `proyectarNivel` (la MISMA función que el webhook).
 *
 * NO llama a `insertarPago` ni inserta ninguna fila — la fila del pago ya
 * existe; reprocesar es SÓLO re-proyectar. `proyectarNivel` es una derivación
 * pura del ledger completo, así que correrlo dos veces sin pagos nuevos da el
 * mismo resultado, cero filas nuevas en `pagos` y nivel estable (US-6:
 * idempotente).
 *
 * Devuelve la forma `{ resultado, valorAnterior, valorNuevo }` que
 * `conAuditoria()` espera — y NO escribe `profiles`/`pagos` fuera del closure que
 * `conAuditoria` ejecuta (garantía estructural de que toda mutación pasa por la
 * auditoría).
 *
 * - Pago inexistente -> lanza `PagoNoEncontrado` (handler -> 404, sin audit).
 * - `estado != 'approved'` -> lanza `PagoNoReprocesable` (handler -> 409, sin
 *   audit, sin cambios).
 */
export async function reprocesarPago(
  admin: AdminClient,
  params: ReprocesarPagoParams,
): Promise<ReprocesarPagoResultado> {
  const { pagoId } = params;

  const { data: pago, error: pagoError } = await admin
    .from("pagos")
    .select("id, user_id, estado")
    .eq("id", pagoId)
    .maybeSingle();
  if (pagoError) throw pagoError;
  if (!pago) throw new PagoNoEncontrado(pagoId);
  if (pago.estado !== "approved") throw new PagoNoReprocesable(pago.estado);

  const { data: perfil, error: perfilError } = await admin
    .from("profiles")
    .select("nivel")
    .eq("id", pago.user_id)
    .maybeSingle();
  if (perfilError) throw perfilError;
  // La FK `pagos.user_id -> profiles.id` garantiza que el perfil existe. Si por
  // un estado inconsistente de la base no estuviera, es una condición
  // excepcional de verdad (no "pago no encontrado" ni "no reprocesable"): que
  // caiga al `catch` genérico del handler -> Sentry + 500.
  if (!perfil) {
    throw new Error(
      `El pago ${pagoId} referencia un usuario (${pago.user_id}) sin fila en profiles.`,
    );
  }

  const nivelAnterior = perfil.nivel;
  const nivelNuevo = await proyectarNivel(admin, pago.user_id);

  return {
    resultado: { nivelAnterior, nivelNuevo },
    valorAnterior: { nivel: nivelAnterior },
    valorNuevo: { nivel: nivelNuevo },
  };
}
