// VGRP-49 — integración real de punta a punta del panel admin de contenido
// (VGRP-38): GET|POST /api/admin/contenido/[entidad] y
// PATCH|DELETE /api/admin/contenido/[entidad]/[id]. Mismo criterio que
// test/integration/admin-usuarios-nivel.test.ts: se importan los handlers
// REALES y sólo se mockea requireAdmin (getVerifiedClaims depende de cookies
// de Next request context) y next/cache (revalidateTag no tiene nada que
// revalidar fuera de un build de Next real). `createServiceRoleClient` está
// mockeado para poder inyectar, en UN solo test, un cliente que rompe
// deliberadamente el insert de auditoría sin tocar el resto de la base — en
// todos los demás tests devuelve el cliente admin real de test, así que
// actualizarContenido/crearContenido/borrarContenido/conAuditoria corren con
// su código real contra Supabase real.
//
// `admin_audit_log.actor_id` tiene FK a `profiles.id` — se crea un usuario
// real de test para actuar de "admin" (nunca se loguea de verdad como admin,
// sólo se usa su id vía el mock de requireAdmin), igual que en
// admin-usuarios-nivel.test.ts.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../lib/database.types";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient } from "../helpers/db-client";
import "../helpers/load-env";
import { TEST_EMAIL_SUFFIX } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

const mockRequireAdmin = vi.fn();
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockCreateServiceRoleClient = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

const mockCaptureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Imports DESPUÉS de los vi.mock (hoisted igual, ver el mismo criterio en
// auth-actions.test.ts / admin-usuarios-nivel.test.ts): son los handlers
// REALES.
const { GET, POST } = await import("../../app/api/admin/contenido/[entidad]/route");
const { PATCH, DELETE } = await import("../../app/api/admin/contenido/[entidad]/[id]/route");

const admin = createTestAdminClient();
const MARCADOR = "[test] admin-contenido";

/** Envuelve el cliente admin real: `.from("admin_audit_log").insert(...)`
 *  falla siempre a propósito; cualquier otra tabla pasa al cliente real sin
 *  tocar nada. Reproduce, contra Postgres de verdad, la rama de
 *  conAuditoria() donde la mutación de negocio SÍ se escribió pero el insert
 *  de auditoría falla después — sin necesitar un cliente 100% fake (a
 *  diferencia de lib/data/admin/audit-log.unit.test.ts, acá el resto de la
 *  mutación es real). */
function clienteConAuditoriaRota(real: SupabaseClient<Database>): SupabaseClient<Database> {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => {
          if (table === "admin_audit_log") {
            return {
              insert: () =>
                Promise.resolve({
                  error: { message: "insert de auditoría roto a propósito (test VGRP-49)" },
                }),
            };
          }
          return (target as unknown as { from: (t: string) => unknown }).from(table);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient<Database>;
}

function reqGet(entidad: string): Promise<Response> {
  return GET(new Request(`https://ogcircle.example/api/admin/contenido/${entidad}`), {
    params: Promise.resolve({ entidad }),
  });
}

function reqPost(entidad: string, body: unknown): Promise<Response> {
  const request = new Request(`https://ogcircle.example/api/admin/contenido/${entidad}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ entidad }) });
}

function reqPatch(entidad: string, id: string, body: unknown): Promise<Response> {
  const request = new Request(`https://ogcircle.example/api/admin/contenido/${entidad}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ entidad, id }) });
}

function reqDelete(entidad: string, id: string): Promise<Response> {
  const request = new Request(`https://ogcircle.example/api/admin/contenido/${entidad}/${id}`, {
    method: "DELETE",
  });
  return DELETE(request, { params: Promise.resolve({ entidad, id }) });
}

async function crearUsuarioDeTest(prefijo: string): Promise<string> {
  const email = `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

describe("panel admin de contenido — integración real (VGRP-49 / VGRP-38)", () => {
  let adminId: string | null = null;
  const agentesCreados: string[] = [];
  const videosCreados: string[] = [];

  beforeEach(async () => {
    mockRequireAdmin.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockRevalidateTag.mockReset();
    mockCaptureException.mockReset();

    adminId = await crearUsuarioDeTest("contenido-actor-admin");
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: adminId });
    mockCreateServiceRoleClient.mockReturnValue(admin);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const id of agentesCreados.splice(0)) {
      await admin.from("agentes").delete().eq("id", id);
    }
    for (const id of videosCreados.splice(0)) {
      await admin.from("videos").delete().eq("id", id);
    }
    if (adminId) {
      await admin.from("admin_audit_log").delete().eq("actor_id", adminId);
      await cleanupUser(adminId);
      adminId = null;
    }
  });

  it("POST agentes: 200 + fila real creada + admin_audit_log con actor_id del admin REAL, accion='crear_contenido', entidadId + revalidateTag('grilla-agentes')", async () => {
    const res = await reqPost("agentes", {
      nombre: `${MARCADOR} ${randomUUID()}`,
      especialidad: "Especialidad test",
      nivel_requerido: "principiante",
      orden: 999,
      activo: true,
      contacto: "contacto-test",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    agentesCreados.push(body.id);

    const { data: fila } = await admin.from("agentes").select().eq("id", body.id).single();
    expect(fila).not.toBeNull();

    const { data: auditRow, error: auditError } = await admin
      .from("admin_audit_log")
      .select("*")
      .eq("entidad_id", body.id)
      .eq("accion", "crear_contenido")
      .single();
    expect(auditError).toBeNull();
    expect(auditRow?.actor_id).toBe(adminId);
    expect(auditRow?.entidad).toBe("agentes");

    expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
    expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
  });

  it("GET agentes: 200 { items } incluye la fila recién creada", async () => {
    const creado = await admin
      .from("agentes")
      .insert({
        nombre: `${MARCADOR} ${randomUUID()}`,
        especialidad: "Test",
        nivel_requerido: "principiante",
        orden: 999,
        activo: true,
      })
      .select()
      .single();
    if (creado.error) throw creado.error;
    agentesCreados.push(creado.data.id);

    const res = await reqGet("agentes");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body.items as Array<{ id: string }>).some((i) => i.id === creado.data.id)).toBe(true);
  });

  it("PATCH agentes: 200 + fila actualizada + admin_audit_log con accion='editar_contenido' + revalidateTag", async () => {
    const creado = await admin
      .from("agentes")
      .insert({
        nombre: `${MARCADOR} original ${randomUUID()}`,
        especialidad: "Test",
        nivel_requerido: "principiante",
        orden: 999,
        activo: true,
      })
      .select()
      .single();
    if (creado.error) throw creado.error;
    agentesCreados.push(creado.data.id);

    const res = await reqPatch("agentes", creado.data.id, { nombre: "Nombre editado por test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nombre).toBe("Nombre editado por test");

    const { data: auditRow } = await admin
      .from("admin_audit_log")
      .select("*")
      .eq("entidad_id", creado.data.id)
      .eq("accion", "editar_contenido")
      .single();
    expect(auditRow?.actor_id).toBe(adminId);
    expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
  });

  it("DELETE videos: soft-delete por HTTP (publicado=false), la fila SIGUE existiendo, + auditoría + revalidateTag('grilla-videos')", async () => {
    const creado = await admin
      .from("videos")
      .insert({
        stage: 1,
        titulo: `${MARCADOR} video ${randomUUID()}`,
        nivel_requerido: "principiante",
        orden: 999,
        publicado: true,
      })
      .select()
      .single();
    if (creado.error) throw creado.error;
    videosCreados.push(creado.data.id);

    const res = await reqDelete("videos", creado.data.id);
    expect(res.status).toBe(200);

    const { data: filaTrasBorrar } = await admin
      .from("videos")
      .select("id, publicado")
      .eq("id", creado.data.id)
      .single();
    expect(filaTrasBorrar).not.toBeNull();
    expect(filaTrasBorrar?.publicado).toBe(false);

    const { data: auditRow } = await admin
      .from("admin_audit_log")
      .select("*")
      .eq("entidad_id", creado.data.id)
      .eq("accion", "borrar_contenido")
      .single();
    expect(auditRow?.actor_id).toBe(adminId);
    expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-videos");
  });

  it("PATCH con :id UUID inexistente -> 404 y SIN fila en admin_audit_log", async () => {
    const idInexistente = randomUUID();
    const res = await reqPatch("agentes", idInexistente, { nombre: "no debería aplicar" });
    expect(res.status).toBe(404);

    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("id")
      .eq("entidad_id", idInexistente);
    expect(audit ?? []).toHaveLength(0);
  });

  it("DELETE con :id UUID inexistente -> 404 y SIN fila en admin_audit_log", async () => {
    const idInexistente = randomUUID();
    const res = await reqDelete("agentes", idInexistente);
    expect(res.status).toBe(404);

    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("id")
      .eq("entidad_id", idInexistente);
    expect(audit ?? []).toHaveLength(0);
  });

  it.each(["profiles", "pagos"])(
    "POST a %s (tabla real fuera de la lista blanca) -> 400, sin fila nueva y sin auditoría",
    async (entidad) => {
      const res = await reqPost(entidad, { nombre: "no debería crear nada" });
      expect(res.status).toBe(400);
      expect(mockRevalidateTag).not.toHaveBeenCalled();

      const { data: audit } = await admin
        .from("admin_audit_log")
        .select("id")
        .eq("actor_id", adminId as string);
      expect(audit ?? []).toHaveLength(0);
    },
  );

  it("POST body inválido (Zod) -> 400 con fieldErrors, cero filas nuevas, cero auditoría", async () => {
    const res = await reqPost("agentes", { nombre: "" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();

    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("id")
      .eq("actor_id", adminId as string);
    expect(audit ?? []).toHaveLength(0);
  });

  // VGRP-49 — "la rama fea": la mutación de negocio SÍ se escribió pero el
  // insert de admin_audit_log falla DESPUÉS. Ver lib/data/admin/audit-log.ts
  // (conAuditoria) y su unit test (audit-log.unit.test.ts) para la misma
  // rama con un cliente 100% fake — acá se reproduce contra Postgres real
  // (la fila de `agentes` sí se crea de verdad) con un cliente que sólo
  // rompe el insert de `admin_audit_log`.
  it("mutación exitosa + insert de auditoría roto -> 200 igual (la mutación no se revierte), SIN fila de auditoría, y Sentry avisa con admin-audit-gap", async () => {
    mockCreateServiceRoleClient.mockReturnValue(clienteConAuditoriaRota(admin));

    const res = await reqPost("agentes", {
      nombre: `${MARCADOR} audit-roto ${randomUUID()}`,
      especialidad: "Test",
      nivel_requerido: "principiante",
      orden: 999,
      activo: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    agentesCreados.push(body.id);

    // La mutación de negocio SÍ ocurrió de verdad.
    const { data: fila } = await admin.from("agentes").select("id").eq("id", body.id).single();
    expect(fila?.id).toBe(body.id);

    // Pero NO hay fila de auditoría (el insert estaba roto a propósito).
    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("id")
      .eq("entidad_id", body.id);
    expect(audit ?? []).toHaveLength(0);

    // conAuditoria reporta el hueco a Sentry con el tag admin-audit-gap (ver
    // lib/data/admin/audit-log.ts).
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, opciones] = mockCaptureException.mock.calls[0];
    expect(opciones).toMatchObject({ tags: { "admin-audit-gap": "true" } });

    // Y sí revalidó (la mutación de negocio, que es lo que importa para la
    // grilla pública, salió bien).
    expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
  });
});
