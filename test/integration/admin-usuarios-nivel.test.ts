// VGRP-47 §3 (cubre VGRP-36) — integración real de punta a punta del handler
// `POST /api/admin/usuarios/[id]/nivel`. A diferencia de
// `app/api/admin/usuarios/[id]/nivel/route.test.ts` (que mockea el guard y
// TODA la capa de datos), acá el handler corre COMPLETO: se importa directo
// (mismo patrón que `test/integration/auth-actions.test.ts`) y sólo se mockea
// `requireAdmin` — es lo único que no se puede ejercitar de verdad desde un
// test de Vitest en Node plano, porque internamente usa `getVerifiedClaims()`,
// que depende de cookies de Next request context (mismo criterio que ya
// documentan los tests HTTP mockeados existentes de esta misma ruta). Todo lo
// demás (`activarNivel`, `conAuditoria`, `createServiceRoleClient`) corre con
// su código real contra Supabase real.
//
// `admin_audit_log.actor_id` y `nivel_overrides.actor_id` tienen FK a
// `public.profiles(id)` (ver supabase/migrations/20260822035923_init_plataforma.sql
// y 20260905030100_nivel_overrides.sql) — un `actorId` de mentira (string fijo
// sin fila real en profiles) rompería el insert de auditoría con una
// violación de FK. Por eso acá se crea un usuario real de test para actuar de
// "admin" (nunca se loguea de verdad como admin — sólo se usa su id, vía el
// mock de requireAdmin) y se limpia como cualquier otro usuario ad hoc.

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

// Import DESPUÉS del vi.mock (hoisted igual, ver el mismo criterio en
// auth-actions.test.ts): éste es el handler REAL, no un mock — sólo
// requireAdmin está reemplazado.
const { POST } = await import("../../app/api/admin/usuarios/[id]/nivel/route");

const admin = createTestAdminClient();

function req(body: unknown, id: string): Promise<Response> {
  const request = new Request(`https://ogcircle.example/api/admin/usuarios/${id}/nivel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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

describe("POST /api/admin/usuarios/[id]/nivel — integración real (VGRP-47 §3 / VGRP-36)", () => {
  let objetivoId: string | null = null;
  let adminId: string | null = null;

  beforeEach(async () => {
    objetivoId = await crearUsuarioDeTest("nivel-objetivo");
    adminId = await crearUsuarioDeTest("nivel-actor-admin");
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: adminId });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // El objetivo primero: si algo falló a mitad de camino y dejó una fila de
    // nivel_overrides con actor_id = adminId, cleanupUser(adminId) igual la
    // borra (deleteFkDependents borra por user_id Y por actor_id, ver
    // test/helpers/cleanup.ts) — no importa el orden, pero se limpian los dos
    // sin excepción.
    if (objetivoId) {
      await cleanupUser(objetivoId);
      objetivoId = null;
    }
    if (adminId) {
      await cleanupUser(adminId);
      adminId = null;
    }
  });

  it("POST válido crea override, actualiza profiles.nivel y app_metadata, y deja fila de auditoría con actor_id del admin", async () => {
    const objetivo = objetivoId as string;
    const actor = adminId as string;

    const res = await req({ nivel: "avanzado", motivo: "pagó por transferencia" }, objetivo);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "avanzado" });

    const { data: override, error: overrideError } = await admin
      .from("nivel_overrides")
      .select("*")
      .eq("user_id", objetivo)
      .single();
    expect(overrideError).toBeNull();
    expect(override?.nivel).toBe("avanzado");
    expect(override?.motivo).toBe("pagó por transferencia");
    expect(override?.actor_id).toBe(actor);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", objetivo)
      .single();
    expect(profileError).toBeNull();
    expect(profile?.nivel).toBe("avanzado");

    const { data: authUser, error: authError } = await withAuthRetry(() =>
      admin.auth.admin.getUserById(objetivo),
    );
    expect(authError).toBeNull();
    expect((authUser?.user?.app_metadata as Record<string, unknown> | undefined)?.nivel).toBe(
      "avanzado",
    );

    const { data: audit, error: auditError } = await admin
      .from("admin_audit_log")
      .select("*")
      .eq("entidad_id", objetivo)
      .eq("accion", "cambiar_nivel")
      .single();
    expect(auditError).toBeNull();
    expect(audit?.actor_id).toBe(actor);
    expect(audit?.entidad).toBe("profiles");
    expect(audit?.entidad_id).toBe(objetivo);
  });

  it("body sin motivo -> 400, y NO se insertó fila en nivel_overrides ni en admin_audit_log", async () => {
    const objetivo = objetivoId as string;

    const res = await req({ nivel: "avanzado" }, objetivo);
    expect(res.status).toBe(400);

    const { data: overrides } = await admin
      .from("nivel_overrides")
      .select("id")
      .eq("user_id", objetivo);
    expect(overrides ?? []).toHaveLength(0);

    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("id")
      .eq("entidad_id", objetivo)
      .eq("accion", "cambiar_nivel");
    expect(audit ?? []).toHaveLength(0);
  });

  it("motivo en blanco -> 400, y NO se insertó fila en nivel_overrides ni en admin_audit_log", async () => {
    const objetivo = objetivoId as string;

    const res = await req({ nivel: "avanzado", motivo: "   " }, objetivo);
    expect(res.status).toBe(400);

    const { data: overrides } = await admin
      .from("nivel_overrides")
      .select("id")
      .eq("user_id", objetivo);
    expect(overrides ?? []).toHaveLength(0);

    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("id")
      .eq("entidad_id", objetivo)
      .eq("accion", "cambiar_nivel");
    expect(audit ?? []).toHaveLength(0);
  });

  it("tras el cambio, releer los claims del usuario objetivo (getUserById) ya refleja app_metadata.nivel actualizado", async () => {
    const objetivo = objetivoId as string;

    const res = await req(
      { nivel: "principiante", motivo: "activación manual de prueba" },
      objetivo,
    );
    expect(res.status).toBe(200);

    // "Releer sus claims" simulado con el Admin API, sin necesitar un login
    // real nuevo — confirma que el registro de auth (de donde sale el JWT en
    // el próximo refresh de sesión) ya quedó sincronizado, no sólo `profiles`.
    const { data: authUser, error } = await withAuthRetry(() =>
      admin.auth.admin.getUserById(objetivo),
    );
    expect(error).toBeNull();
    expect((authUser?.user?.app_metadata as Record<string, unknown> | undefined)?.nivel).toBe(
      "principiante",
    );
  });
});
