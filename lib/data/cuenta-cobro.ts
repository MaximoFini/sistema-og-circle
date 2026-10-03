import "server-only";

// VGRP-62 — a dónde transfiere el usuario. Firma fijada por VGRP-68 (la usa
// VGRP-64 en /comprar): no cambiarla sin avisar.
//
// Devuelve SÓLO los campos de `CuentaCobroVisible`. La tabla `cuentas_cobro` no
// tiene policies (default-deny): no se expone por PostgREST, así que la lectura
// va por service role desde el servidor. La cuenta no es secreta (la ve
// cualquier usuario logueado), pero tampoco se publica por la API.
//
// FAIL-CLOSED: ante cualquier error de lectura devuelve `null` ("no hay cuenta
// activa") y lo reporta a Sentry. Para quien paga, un `null` es "el pago no está
// disponible"; nunca se inventa ni se cachea una cuenta vieja — mostrar una
// cuenta equivocada desvía plata.

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CuentaCobroVisible } from "@/lib/pagos/transferencia/contrato";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "../database.types";

/** Lectura pura contra un cliente inyectado (testeable con el cliente de test). */
export async function consultarCuentaActiva(
  admin: SupabaseClient<Database>,
): Promise<CuentaCobroVisible | null> {
  const { data, error } = await admin
    .from("cuentas_cobro")
    .select("id, titular, cuit, banco, cbu_cvu, alias, notas")
    .eq("activa", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    titular: data.titular,
    cuit: data.cuit,
    banco: data.banco,
    cbuCvu: data.cbu_cvu,
    alias: data.alias,
    notas: data.notas,
  };
}

/** Cuenta de cobro activa (sólo campos visibles), o `null` si no hay ninguna. */
export async function obtenerCuentaActiva(): Promise<CuentaCobroVisible | null> {
  try {
    return await consultarCuentaActiva(createServiceRoleClient());
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "obtenerCuentaActiva" } });
    return null;
  }
}
