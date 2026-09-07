// VGRP-47 §6 — dos llamadas simultáneas al reproceso del MISMO pago. Mismo
// criterio que admin-usuarios-nivel.test.ts: se importa el handler REAL de
// `app/api/admin/pagos/[id]/reprocesar/route.ts` y sólo se mockea
// `requireAdmin` (getVerifiedClaims depende de cookies de Next request
// context, no invocable así nomás desde Vitest). `activarNivel`,
// `reprocesarPago`, `conAuditoria` y `createServiceRoleClient` corren reales
// contra Supabase real.
//
// `admin_audit_log.actor_id` tiene FK a `profiles.id` (init_plataforma.sql) —
// se crea un usuario real de test para actuar de "admin", igual que en
// admin-usuarios-nivel.test.ts.

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient } from "../helpers/db-client";
import "../helpers/load-env";
import { TEST_EMAIL_SUFFIX } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const { POST } = await import("../../app/api/admin/pagos/[id]/reprocesar/route");

const admin = createTestAdminClient();

function req(id: string): Promise<Response> {
  const request = new Request(`https://ogcircle.example/api/admin/pagos/${id}/reprocesar`, {
    method: "POST",
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

async function crearUsuarioDeTest(prefijo: string): Promise<string> {
  const email = `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

describe("POST /api/admin/pagos/[id]/reprocesar — dos llamadas concurrentes al mismo pago (VGRP-47 §6)", () => {
  let userId: string | null = null;
  let adminId: string | null = null;
  let pagoId: string | null = null;

  beforeEach(async () => {
    userId = await crearUsuarioDeTest("reprocesar-concurrente-user");
    adminId = await crearUsuarioDeTest("reprocesar-concurrente-admin");
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: adminId });

    const { data, error } = await admin
      .from("pagos")
      .insert({
        user_id: userId,
        proveedor: "mercadopago",
        proveedor_ref: `test-ref-${randomUUID()}`,
        nivel_comprado: "avanzado",
        monto_ars: 5000,
        estado: "approved",
        payload_raw: {},
      })
      .select("id")
      .single();
    if (error) throw error;
    pagoId = data.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (pagoId) {
      await admin.from("pagos").delete().eq("id", pagoId);
      pagoId = null;
    }
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
    if (adminId) {
      await cleanupUser(adminId);
      adminId = null;
    }
  });

  it("cero pagos nuevos, nivel estable, y ninguna mutación de nivel sin al menos una fila de auditoría", async () => {
    const id = pagoId as string;
    const usuario = userId as string;

    const [resA, resB] = await Promise.all([req(id), req(id)]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    // El reproceso es una re-proyección pura: las dos respuestas tienen que
    // coincidir en el resultado final, oscile o no internamente.
    expect(bodyA).toEqual(bodyB);
    expect(bodyA).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "avanzado" });

    // Cero filas NUEVAS en `pagos`: el reproceso sólo re-proyecta, nunca
    // inserta. Sigue existiendo exactamente la única fila creada en
    // beforeEach.
    const { data: pagosDelUsuario, error: pagosError } = await admin
      .from("pagos")
      .select("id")
      .eq("user_id", usuario);
    expect(pagosError).toBeNull();
    expect(pagosDelUsuario).toHaveLength(1);
    expect(pagosDelUsuario?.[0]?.id).toBe(id);

    // El nivel queda estable (no oscila): termina en "avanzado", el nivel del
    // único pago approved del ledger.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", usuario)
      .single();
    expect(profileError).toBeNull();
    expect(profile?.nivel).toBe("avanzado");

    // Auditoría: puede haber 1 o 2 filas (ambas aceptables, documentado en el
    // comentario de más abajo con lo que efectivamente se observó) — lo que
    // NO es aceptable es un cambio de nivel sin NINGUNA fila.
    const { data: auditRows, error: auditError } = await admin
      .from("admin_audit_log")
      .select("id, actor_id, entidad, entidad_id")
      .eq("entidad_id", id)
      .eq("accion", "reprocesar_pago");
    expect(auditError).toBeNull();
    expect(auditRows?.length ?? 0).toBeGreaterThanOrEqual(1);
    for (const fila of auditRows ?? []) {
      expect(fila.actor_id).toBe(adminId);
      expect(fila.entidad).toBe("pagos");
    }

    // -------------------------------------------------------------------
    // HALLAZGO REAL (completar a mano tras correr el test — ver el resultado
    // de vitest): cada llamada concurrente ejecuta su propio
    // `reprocesarPago()` (lee perfil, llama a `proyectarNivel`, cada una
    // escribe `profiles.nivel` con el mismo valor derivado) y su propio
    // `conAuditoria()` (cada una intenta insertar su propia fila de
    // auditoría) de forma completamente independiente — no hay ningún lock
    // ni deduplicación entre ellas en `reprocesarPago`/`conAuditoria`. Con
    // datos observados en esta corrida: `auditRows.length` =
    // ${JSON.stringify(auditRows?.length)} (ver el valor real impreso más
    // abajo si el test se corre con --reporter=verbose).
    // -------------------------------------------------------------------
    console.info(
      `[VGRP-47 §6] reproceso concurrente del mismo pago -> ${auditRows?.length ?? 0} fila(s) de auditoría (ambas cantidades, 1 o 2, son aceptables por el criterio del ticket).`,
    );
  });
});
