// VGRP-24a — núcleo reutilizable de la proyección `pagos -> nivel`.
//
// Este módulo es el punto de entrada compartido entre el webhook de Mercado
// Pago (VGRP-23, que lo importa para procesar notificaciones de pago) y el
// panel de admin (activación manual, reproceso de un usuario puntual). Ambas
// funciones reciben el cliente admin YA CREADO como parámetro en vez de
// crearlo ellas mismas: así son testeables inyectando un cliente de test
// (`createTestAdminClient()`) y reutilizables sin importar `server-only`
// transitivamente desde los tests.
//
// Ver `supabase/migrations/20260822035923_init_plataforma.sql` (tabla
// `pagos`, constraint UNIQUE(proveedor_ref, estado)) y
// `supabase/migrations/20260905023031_nivel_vigente_precedencia.sql` (función
// `nivel_vigente`, precedencia por nivel más alto, no por recencia) para el
// contexto de negocio que este archivo asume y NO reimplementa en JS — la
// lógica de "cuál es el nivel vigente" vive enteramente en la función SQL.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NivelAcceso, Tables } from "../database.types";

type PagoRow = Tables<"pagos">;

export interface InsertarPagoParams {
  userId: string;
  proveedorRef: string;
  nivelComprado: NivelAcceso;
  montoArs: number;
  estado: string;
  payloadRaw: PagoRow["payload_raw"];
}

export type InsertarPagoResultado =
  | { inserted: true; pago: PagoRow }
  | { inserted: false; motivo: "duplicado" };

/**
 * Inserta una fila en el ledger append-only `pagos`.
 *
 * Si Supabase devuelve el error de violación de UNIQUE (código Postgres
 * `23505`, que acá sólo puede venir de `pagos_proveedor_ref_estado_key`), es
 * un reintento del webhook reenviando la misma notificación para el mismo
 * `(proveedor_ref, estado)` — un caso ESPERADO en un webhook (Mercado Pago
 * reintenta notificaciones), no un fallo. Se devuelve
 * `{ inserted: false, motivo: "duplicado" }` en vez de propagar el error para
 * que el caller pueda tratarlo como "ya procesado" sin necesidad de un
 * try/catch especial.
 *
 * Cualquier OTRO error sí se propaga (throw): ahí no hay ninguna
 * interpretación de negocio válida más que "algo falló de verdad", y tiene
 * que llegar a Sentry desde el caller (el webhook), no quedar tragado acá.
 */
export async function insertarPago(
  admin: SupabaseClient<Database>,
  params: InsertarPagoParams,
): Promise<InsertarPagoResultado> {
  const { data, error } = await admin
    .from("pagos")
    .insert({
      user_id: params.userId,
      proveedor_ref: params.proveedorRef,
      nivel_comprado: params.nivelComprado,
      monto_ars: params.montoArs,
      estado: params.estado,
      payload_raw: params.payloadRaw,
      proveedor: "mercadopago",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { inserted: false, motivo: "duplicado" };
    }
    throw error;
  }

  return { inserted: true, pago: data };
}

/**
 * El núcleo de la proyección `pagos -> nivel`: dado un usuario, recalcula su
 * nivel vigente a partir de TODO su ledger de pagos y lo refleja en
 * `profiles.nivel` y en el `app_metadata` de auth (para que el próximo
 * refresh de sesión traiga el claim correcto — ver el Auth Hook de
 * `supabase/migrations/20260822035925_auth_hook.sql`).
 *
 * IDEMPOTENCIA (criterio de aceptación explícito de VGRP-24): `nivel_vigente`
 * es una derivación PURA del ledger completo en el momento de la llamada, no
 * un incremento sobre el estado anterior. Invocar `proyectarNivel` dos veces
 * seguidas para el mismo usuario, sin pagos nuevos en el medio, hace el mismo
 * cálculo y escribe el mismo resultado las dos veces — no hay ningún
 * contador ni bandera de "ya procesado" que se pise o se duplique. Esto es lo
 * que permite que el webhook la llame sin problema ante un reintento, y que
 * el panel de admin la use para "reprocesar" un usuario sin efectos
 * acumulativos.
 *
 * El `rol` se lee de `profiles` en vez de asumir un default: `nivel` y `rol`
 * viajan siempre juntos en `updateUserById` (ver la convención documentada en
 * `applyNivelRol`, `test/helpers/db-client.ts`) para no pisar el rol actual
 * del usuario (ej. un admin) con el default `'user'`.
 *
 * Manejo de errores: si el RPC o cualquiera de los dos updates fallan, se
 * propaga el error (throw). No hay ninguna razón de negocio para tragarlo
 * acá — el caller (el webhook) es quien decide si reintenta o lo manda a
 * Sentry.
 *
 * Devuelve el nivel resuelto para que el caller lo use, por ejemplo, al
 * armar el email de confirmación de pago (VGRP-26/23, no responsabilidad de
 * esta función).
 */
export async function proyectarNivel(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<NivelAcceso> {
  const { data: nivel, error: rpcError } = await admin.rpc("nivel_vigente", {
    p_user_id: userId,
  });
  if (rpcError) throw rpcError;

  const { data: profile, error: profileReadError } = await admin
    .from("profiles")
    .select("rol")
    .eq("id", userId)
    .single();
  if (profileReadError) throw profileReadError;

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ nivel })
    .eq("id", userId);
  if (profileUpdateError) throw profileUpdateError;

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { nivel, rol: profile.rol },
  });
  if (metadataError) throw metadataError;

  return nivel;
}
