// VGRP-88 — reorden de videos y materiales a través de SU route.ts (guard + handler compartido),
// mockeado: el contrato HTTP es el de siempre y se prueba para las dos entidades.

import { beforeEach, describe, expect, it, vi } from "vitest";

class ItemNoEncontradoMock extends Error {}

const mockRequireAdmin = vi.fn();
const mockReordenarContenido = vi.fn();
const mockConAuditoria = vi.fn();
const mockRevalidateTag = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/lib/data/admin/contenido", () => ({
  reordenarContenido: (...args: unknown[]) => mockReordenarContenido(...args),
  ItemNoEncontrado: ItemNoEncontradoMock,
  TAG_POR_ENTIDAD: { videos: "grilla-videos", materiales: "grilla-materiales" },
}));
vi.mock("@/lib/data/admin/audit-log", () => ({
  conAuditoria: (...args: unknown[]) => mockConAuditoria(...args),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ marker: "admin-client" }),
}));
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const A = "123e4567-e89b-12d3-a456-426614174000";
const B = "223e4567-e89b-12d3-a456-426614174000";

const put = (body: unknown) =>
  new Request("https://ogcircle.example/api/admin/contenido/x/orden", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetModules();
  for (const m of [
    mockRequireAdmin,
    mockReordenarContenido,
    mockConAuditoria,
    mockRevalidateTag,
    mockCaptureException,
  ]) {
    m.mockReset();
  }
  mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
  mockReordenarContenido.mockResolvedValue({ resultado: [{ id: A, orden: 0 }] });
  mockConAuditoria.mockImplementation(
    async (_a: unknown, _m: unknown, fn: () => Promise<{ resultado: unknown }>) =>
      (await fn()).resultado,
  );
});

describe.each(["videos", "materiales"] as const)("reordenar(%s)", (entidad) => {
  const llamar = async (body: unknown) =>
    entidad === "videos"
      ? (await import("./videos/orden/route")).PUT(put(body))
      : (await import("./materiales/orden/route")).PUT(put(body));

  it("sin sesión -> 401, no toca nada", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    });

    expect((await llamar({ ids: [A] })).status).toBe(401);
    expect(mockReordenarContenido).not.toHaveBeenCalled();
  });

  it("no admin -> 404, no toca nada", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    });

    expect((await llamar({ ids: [A] })).status).toBe(404);
    expect(mockReordenarContenido).not.toHaveBeenCalled();
  });

  it.each([
    ["sin ids", {}],
    ["lista vacía", { ids: [] }],
    ["id que no es uuid", { ids: ["no-es-uuid"] }],
    ["ids repetidos", { ids: [A, A] }],
  ])("body inválido (%s) -> 400, no toca la base", async (_, body) => {
    expect((await llamar(body)).status).toBe(400);
    expect(mockReordenarContenido).not.toHaveBeenCalled();
  });

  it("ok -> 200 { orden }, auditoría reordenar_contenido de ESTA entidad y revalida SU tag", async () => {
    const res = await llamar({ ids: [A, B] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orden: [{ id: A, orden: 0 }] });
    expect(mockReordenarContenido).toHaveBeenCalledWith({ marker: "admin-client" }, entidad, [
      A,
      B,
    ]);
    expect(mockConAuditoria).toHaveBeenCalledWith(
      { marker: "admin-client" },
      { actorId: "admin-1", accion: "reordenar_contenido", entidad },
      expect.any(Function),
    );
    expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
    expect(mockRevalidateTag).toHaveBeenCalledWith(`grilla-${entidad}`);
  });

  it("un id que no existe -> 404, sin revalidar", async () => {
    mockReordenarContenido.mockRejectedValue(new ItemNoEncontradoMock());

    expect((await llamar({ ids: [A] })).status).toBe(404);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("un error inesperado -> 500, avisa a Sentry y no revalida", async () => {
    mockReordenarContenido.mockRejectedValue(new Error("boom"));

    expect((await llamar({ ids: [A] })).status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });
});
