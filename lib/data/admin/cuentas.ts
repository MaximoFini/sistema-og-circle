// =============================================================================
// VGRP-62 / Bloque 13 — Capa de datos del panel de cuentas de cobro.
//
// Mismo patrón que lib/data/admin/contenido.ts: el cliente se INYECTA (nunca se
// crea acá), así estos helpers se testean con createTestAdminClient(). Toda
// mutación devuelve `ResultadoMutacion` para ejecutarse dentro de
// `conAuditoria()` (la ruta es quien la envuelve).
//
// NO HAY BORRADO: las cuentas se desactivan, porque
// `comprobantes_transferencia.cuenta_cobro_id` (VGRP-63) las referencia.
// =============================================================================

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cuentaCobroPatchSchema, cuentaCobroSchema } from "@/lib/pagos/cuentas-cobro";
import type { Database, Json, Tables } from "../../database.types";
import type { ResultadoMutacion } from "./audit-log";

type AdminClient = SupabaseClient<Database>;

export type CuentaCobro = Tables<"cuentas_cobro">;

export class CuentaNoEncontrada extends Error {
  constructor(id: string) {
    super(`No existe una cuenta de cobro con id ${id}.`);
    this.name = "CuentaNoEncontrada";
  }
}

export async function listarCuentas(admin: AdminClient): Promise<CuentaCobro[]> {
  // La activa primero, después las más nuevas. Techo explícito (VGRP-54): un
  // negocio tiene un puñado de cuentas, no cientos.
  const { data, error } = await admin
    .from("cuentas_cobro")
    .select("*")
    .order("activa", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function obtenerCuenta(admin: AdminClient, id: string): Promise<CuentaCobro | null> {
  const { data, error } = await admin.from("cuentas_cobro").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * `valores` sin validar (viene del body del request). Una cuenta nueva SIEMPRE
 * nace inactiva: activarla es una acción explícita aparte, para que cargar una
 * cuenta no cambie sola a dónde transfieren los usuarios.
 */
export async function crearCuenta(
  admin: AdminClient,
  valores: unknown,
): Promise<ResultadoMutacion<CuentaCobro>> {
  const datos = cuentaCobroSchema.parse(valores);

  const { data, error } = await admin
    .from("cuentas_cobro")
    .insert({ ...datos, activa: false })
    .select()
    .single();
  if (error) throw error;

  return {
    resultado: data,
    valorAnterior: null,
    valorNuevo: data as unknown as Json,
    entidadId: data.id,
  };
}

export async function actualizarCuenta(
  admin: AdminClient,
  id: string,
  valores: unknown,
): Promise<ResultadoMutacion<CuentaCobro>> {
  const datos = cuentaCobroPatchSchema.parse(valores);

  const anterior = await obtenerCuenta(admin, id);
  if (!anterior) throw new CuentaNoEncontrada(id);

  // No hay trigger de updated_at en el repo: se setea acá.
  const { data, error } = await admin
    .from("cuentas_cobro")
    .update({ ...datos, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  return {
    resultado: data,
    valorAnterior: anterior as unknown as Json,
    valorNuevo: data as unknown as Json,
    entidadId: id,
  };
}

interface RespuestaActivar {
  anterior: CuentaCobro | null;
  nuevo: CuentaCobro;
}

/**
 * Deja `id` como la única cuenta activa, vía `activar_cuenta_cobro()` (una
 * transacción, serializada). El valor anterior que se audita es la cuenta que
 * estaba activa — leída dentro de esa misma transacción, no antes.
 */
export async function activarCuenta(
  admin: AdminClient,
  id: string,
): Promise<ResultadoMutacion<CuentaCobro>> {
  const { data, error } = await admin.rpc("activar_cuenta_cobro", { p_id: id });
  if (error) {
    // P0002 = no_data_found, lo levanta la función cuando el id no existe.
    if (error.code === "P0002") throw new CuentaNoEncontrada(id);
    throw error;
  }

  const { anterior, nuevo } = data as unknown as RespuestaActivar;
  return {
    resultado: nuevo,
    valorAnterior: anterior as unknown as Json | null,
    valorNuevo: nuevo as unknown as Json,
    entidadId: id,
  };
}
