// Foto de perfil (specs/foto-perfil-agentes-profesionales) — integración real
// de PUT|DELETE /api/admin/contenido/[entidad]/[id]/foto y de la limpieza en
// DELETE /api/admin/contenido/[entidad]/[id]. Mismo criterio que
// admin-contenido.test.ts: handlers REALES contra Supabase real (base +
// Storage); sólo se mockean requireAdmin, next/cache y Sentry.
//
// Requiere la migración 20261009120000_foto_directorio.sql. Toda fila creada
// lleva el prefijo "[test]" (red de contención: cleanupContenidoDeTest, que
// también borra los objetos del bucket).

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../lib/database.types";
import { FOTO_BUCKET } from "../../lib/fotos/constantes";
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

const { PUT, DELETE: DELETE_FOTO } = await import(
  "../../app/api/admin/contenido/[entidad]/[id]/foto/route"
);
const { PATCH, DELETE } = await import("../../app/api/admin/contenido/[entidad]/[id]/route");

const admin = createTestAdminClient();
const MARCADOR = "[test] admin-foto";

async function jpeg(color: number): Promise<Blob> {
  const buffer = await sharp({
    create: { width: 700, height: 500, channels: 3, background: { r: color, g: 90, b: 30 } },
  })
    .jpeg()
    .toBuffer();
  return new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
}

function put(entidad: string, id: string, archivo: Blob): Promise<Response> {
  const form = new FormData();
  form.set("foto", archivo, "foto.jpg");
  return PUT(
    new Request(`https://ogcircle.example/api/admin/contenido/${entidad}/${id}/foto`, {
      method: "PUT",
      body: form,
    }),
    { params: Promise.resolve({ entidad, id }) },
  );
}

function quitar(entidad: string, id: string): Promise<Response> {
  return DELETE_FOTO(new Request("https://ogcircle.example/x", { method: "DELETE" }), {
    params: Promise.resolve({ entidad, id }),
  });
}

async function fotoPath(entidad: "agentes" | "profesionales", id: string) {
  const { data, error } = await admin.from(entidad).select("foto_path").eq("id", id).single();
  if (error) throw error;
  return data.foto_path;
}

async function existeObjeto(path: string): Promise<boolean> {
  const carpeta = path.slice(0, path.lastIndexOf("/"));
  const nombre = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(FOTO_BUCKET).list(carpeta);
  if (error) throw error;
  return (data ?? []).some((o) => o.name === nombre);
}

async function crearUsuarioDeTest(): Promise<string> {
  const email = `foto-actor-admin-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

describe("foto de perfil de agentes/profesionales — integración real", () => {
  let adminId: string | null = null;
  const agentes: string[] = [];
  const profesionales: string[] = [];

  async function crearAgente(): Promise<string> {
    const { data, error } = await admin
      .from("agentes")
      .insert({ nombre: `${MARCADOR} ${randomUUID()}`, especialidad: "Test" })
      .select("id")
      .single();
    if (error) throw error;
    agentes.push(data.id);
    return data.id;
  }

  beforeEach(async () => {
    for (const m of [
      mockRequireAdmin,
      mockCreateServiceRoleClient,
      mockRevalidateTag,
      mockCaptureException,
    ]) {
      m.mockReset();
    }
    adminId = await crearUsuarioDeTest();
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: adminId });
    mockCreateServiceRoleClient.mockReturnValue(admin);
  });

  afterEach(async () => {
    for (const [tabla, ids] of [
      ["agentes", agentes],
      ["profesionales", profesionales],
    ] as const) {
      for (const id of ids.splice(0)) {
        const { data } = await admin.storage.from(FOTO_BUCKET).list(`${tabla}/${id}`);
        const paths = (data ?? []).map((o) => `${tabla}/${id}/${o.name}`);
        if (paths.length > 0) await admin.storage.from(FOTO_BUCKET).remove(paths);
        await admin.from(tabla).delete().eq("id", id);
      }
    }
    if (adminId) {
      await admin.from("admin_audit_log").delete().eq("actor_id", adminId);
      await cleanupUser(adminId);
      adminId = null;
    }
  });

  it("PUT: guarda la foto, la sirve por URL pública, audita y revalida", async () => {
    const id = await crearAgente();
    const res = await put("agentes", id, await jpeg(200));
    expect(res.status).toBe(200);
    const { fotoUrl } = await res.json();

    const path = await fotoPath("agentes", id);
    expect(path).toMatch(new RegExp(`^agentes/${id}/.+\\.webp$`));
    expect(fotoUrl).toContain(path);

    const img = await fetch(fotoUrl);
    expect(img.status).toBe(200);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 512]);

    const { data: audit } = await admin
      .from("admin_audit_log")
      .select("accion, valor_anterior, valor_nuevo")
      .eq("entidad_id", id)
      .eq("accion", "cambiar_foto_contenido")
      .single();
    expect(audit?.valor_anterior).toMatchObject({ foto_path: null });
    expect(audit?.valor_nuevo).toMatchObject({
      foto_path: path,
      nombre: expect.stringContaining(MARCADOR),
    });
    expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
  });

  it("PUT dos veces: queda la nueva y se borra el objeto anterior", async () => {
    const id = await crearAgente();
    await put("agentes", id, await jpeg(10));
    const vieja = (await fotoPath("agentes", id)) as string;

    const res = await put("agentes", id, await jpeg(250));
    expect(res.status).toBe(200);
    const nueva = (await fotoPath("agentes", id)) as string;

    expect(nueva).not.toBe(vieja);
    expect(await existeObjeto(nueva)).toBe(true);
    expect(await existeObjeto(vieja)).toBe(false);
  });

  it("PUT con imagen inválida: 400 y la foto anterior queda intacta", async () => {
    const id = await crearAgente();
    await put("agentes", id, await jpeg(10));
    const anterior = await fotoPath("agentes", id);

    const res = await put("agentes", id, new Blob(["no soy una imagen"]));
    expect(res.status).toBe(400);
    expect(await fotoPath("agentes", id)).toBe(anterior);
  });

  it("PUT: si falla el UPDATE, la fila conserva la foto anterior y no queda el objeto nuevo", async () => {
    const id = await crearAgente();
    await put("agentes", id, await jpeg(10));
    const anterior = (await fotoPath("agentes", id)) as string;

    // Cliente real con el UPDATE de `agentes` roto a propósito (todo lo demás real).
    const roto = new Proxy(admin, {
      get(target, prop, receiver) {
        if (prop !== "from") return Reflect.get(target, prop, receiver);
        return (tabla: string) => {
          const real = (target as unknown as { from: (t: string) => Record<string, unknown> }).from(
            tabla,
          );
          if (tabla !== "agentes") return real;
          return new Proxy(real, {
            get(t, p, r) {
              if (p === "update") {
                return () => ({
                  eq: () => Promise.resolve({ error: { message: "update roto (test)" } }),
                });
              }
              return Reflect.get(t, p, r);
            },
          });
        };
      },
    }) as SupabaseClient<Database>;
    mockCreateServiceRoleClient.mockReturnValue(roto);

    const res = await put("agentes", id, await jpeg(250));
    expect(res.status).toBe(500);
    expect(await fotoPath("agentes", id)).toBe(anterior);
    expect(await existeObjeto(anterior)).toBe(true);

    const { data } = await admin.storage.from(FOTO_BUCKET).list(`agentes/${id}`);
    expect((data ?? []).map((o) => `agentes/${id}/${o.name}`)).toEqual([anterior]);
  });

  it("DELETE /foto: deja la fila sin foto, borra el objeto y audita; repetirlo es 200", async () => {
    const id = await crearAgente();
    await put("agentes", id, await jpeg(10));
    const path = (await fotoPath("agentes", id)) as string;

    expect((await quitar("agentes", id)).status).toBe(200);
    expect(await fotoPath("agentes", id)).toBeNull();
    expect(await existeObjeto(path)).toBe(false);

    const { count } = await admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("entidad_id", id)
      .eq("accion", "quitar_foto_contenido");
    expect(count).toBe(1);

    expect((await quitar("agentes", id)).status).toBe(200);
  });

  it("borrar el profesional borra también su foto", async () => {
    const { data, error } = await admin
      .from("profesionales")
      .insert({ nombre: `${MARCADOR} ${randomUUID()}`, rubro: "Test" })
      .select("id")
      .single();
    if (error) throw error;
    profesionales.push(data.id);

    await put("profesionales", data.id, await jpeg(10));
    const path = (await fotoPath("profesionales", data.id)) as string;

    const res = await DELETE(new Request("https://ogcircle.example/x", { method: "DELETE" }), {
      params: Promise.resolve({ entidad: "profesionales", id: data.id }),
    });
    expect(res.status).toBe(200);
    expect(await existeObjeto(path)).toBe(false);
  });

  it("un PATCH genérico no puede escribir foto_path", async () => {
    const id = await crearAgente();
    const res = await PATCH(
      new Request("https://ogcircle.example/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ especialidad: "Otra", foto_path: "agentes/otro/robada.webp" }),
      }),
      { params: Promise.resolve({ entidad: "agentes", id }) },
    );
    expect(res.status).toBe(200);
    expect(await fotoPath("agentes", id)).toBeNull();
  });
});
