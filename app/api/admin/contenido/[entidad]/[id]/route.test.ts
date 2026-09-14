// VGRP-49 — tests unitarios (mockeados, sin Postgres real) de
// PATCH|DELETE /api/admin/contenido/[entidad]/[id]. No existía route.test.ts
// para esta ruta (verificado). Mismo estilo que
// app/api/admin/usuarios/[id]/nivel/route.test.ts. Complementa a
// test/integration/admin-contenido.test.ts (handler real contra Supabase
// real).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

class ItemNoEncontradoMock extends Error {
  constructor() {
    super("no existe");
    this.name = "ItemNoEncontrado";
  }
}

const mockRequireAdmin = vi.fn();
const mockActualizarContenido = vi.fn();
const mockBorrarContenido = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockRevalidateTag = vi.fn();
const mockCaptureException = vi.fn();

const ENTIDADES_REALES = ["agentes", "videos", "profesionales", "servicios_financieros"] as const;
const TAG_POR_ENTIDAD: Record<(typeof ENTIDADES_REALES)[number], string> = {
  agentes: "grilla-agentes",
  videos: "grilla-videos",
  profesionales: "grilla-profesionales",
  servicios_financieros: "grilla-servicios",
};

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/data/admin/contenido", () => ({
  esEntidadValida: (v: string): boolean => (ENTIDADES_REALES as readonly string[]).includes(v),
  actualizarContenido: (...args: unknown[]) => mockActualizarContenido(...args),
  borrarContenido: (...args: unknown[]) => mockBorrarContenido(...args),
  ItemNoEncontrado: ItemNoEncontradoMock,
  TAG_POR_ENTIDAD,
}));

vi.mock("@/lib/data/admin/audit-log", () => ({
  conAuditoria: (...args: unknown[]) => mockConAuditoria(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const UUID = "11111111-1111-4111-8111-111111111111";

function req(method: "PATCH" | "DELETE", body?: unknown): Request {
  return new Request(`https://ogcircle.example/api/admin/contenido/agentes/${UUID}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callPatch(entidad: string, id: string, body: unknown) {
  const { PATCH } = await import("./route");
  return PATCH(req("PATCH", body), { params: Promise.resolve({ entidad, id }) });
}

async function callDelete(entidad: string, id: string) {
  const { DELETE } = await import("./route");
  return DELETE(req("DELETE"), { params: Promise.resolve({ entidad, id }) });
}

/** Un z.ZodError real (safeParse, no try/catch) — evita simular la forma del
 *  error a mano, y evita un `as z.ZodError` sobre algo que podría no estarlo. */
function crearZodErrorReal(): z.ZodError {
  const resultado = z.object({ nombre: z.string().min(1) }).safeParse({ nombre: "" });
  if (resultado.success) throw new Error("se esperaba que este parse fallara");
  return resultado.error;
}

describe("PATCH|DELETE /api/admin/contenido/[entidad]/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      mockRequireAdmin,
      mockActualizarContenido,
      mockBorrarContenido,
      mockConAuditoria,
      mockCreateServiceRoleClient,
      mockRevalidateTag,
      mockCaptureException,
    ]) {
      m.mockReset();
    }

    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockCreateServiceRoleClient.mockReturnValue({ marker: "admin-client" });
    mockConAuditoria.mockImplementation(
      async (_admin: unknown, _meta: unknown, mutacion: () => Promise<{ resultado: unknown }>) => {
        const r = await mutacion();
        return r.resultado;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("declara export const dynamic = 'force-dynamic'", async () => {
    const mod = await import("./route");
    expect(mod.dynamic).toBe("force-dynamic");
  });

  describe("PATCH", () => {
    it("sin sesión -> 401, no llama a actualizarContenido", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No autenticado." }, { status: 401 }),
      });
      const res = await callPatch("agentes", UUID, { nombre: "x" });
      expect(res.status).toBe(401);
      expect(mockActualizarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it("rol != admin -> 404, no llama a actualizarContenido ni instancia el cliente de service role", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No encontrado." }, { status: 404 }),
      });
      const res = await callPatch("agentes", UUID, { nombre: "x" });
      expect(res.status).toBe(404);
      expect(mockActualizarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it.each(["profiles", "pagos"])(
      "%s fuera de la lista blanca -> 400, sin tocar la base",
      async (entidad) => {
        const res = await callPatch(entidad, UUID, { nombre: "x" });
        expect(res.status).toBe(400);
        expect(mockActualizarContenido).not.toHaveBeenCalled();
        expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      },
    );

    it("id no-uuid -> 404, sin tocar la base", async () => {
      const res = await callPatch("agentes", "no-es-un-uuid", { nombre: "x" });
      expect(res.status).toBe(404);
      expect(mockActualizarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it("body inválido (Zod real) -> 400 con fieldErrors, no revalida", async () => {
      mockActualizarContenido.mockRejectedValue(crearZodErrorReal());

      const res = await callPatch("agentes", UUID, { nombre: "" });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.fieldErrors).toBeDefined();
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it("id uuid pero sin fila (ItemNoEncontrado) -> 404, SIN llamar a conAuditoria con un registro de auditoría (la mutación nunca resolvió)", async () => {
      mockActualizarContenido.mockRejectedValue(new ItemNoEncontradoMock());
      const res = await callPatch("agentes", UUID, { nombre: "x" });
      expect(res.status).toBe(404);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it("happy path -> 200 + fila actualizada + conAuditoria(accion='editar_contenido', entidadId=id) + revalidateTag UNA vez", async () => {
      mockActualizarContenido.mockResolvedValue({
        resultado: { id: UUID, nombre: "Editado" },
        valorAnterior: { nombre: "Viejo" },
        valorNuevo: { nombre: "Editado" },
      });

      const res = await callPatch("agentes", UUID, { nombre: "Editado" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: UUID, nombre: "Editado" });
      expect(mockConAuditoria).toHaveBeenCalledWith(
        { marker: "admin-client" },
        expect.objectContaining({
          actorId: "admin-1",
          accion: "editar_contenido",
          entidad: "agentes",
          entidadId: UUID,
        }),
        expect.any(Function),
      );
      expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
      expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
    });

    it("una escritura fallida (error inesperado) no revalida nada", async () => {
      mockActualizarContenido.mockRejectedValue(new Error("boom"));
      const res = await callPatch("agentes", UUID, { nombre: "x" });
      expect(res.status).toBe(500);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    it("sin sesión -> 401, no llama a borrarContenido", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No autenticado." }, { status: 401 }),
      });
      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(401);
      expect(mockBorrarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it("rol != admin -> 404, no llama a borrarContenido ni instancia el cliente de service role", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No encontrado." }, { status: 404 }),
      });
      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(404);
      expect(mockBorrarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it.each(["profiles", "pagos"])(
      "%s fuera de la lista blanca -> 400, sin tocar la base",
      async (entidad) => {
        const res = await callDelete(entidad, UUID);
        expect(res.status).toBe(400);
        expect(mockBorrarContenido).not.toHaveBeenCalled();
      },
    );

    it("id no-uuid -> 404, sin tocar la base", async () => {
      const res = await callDelete("agentes", "no-es-un-uuid");
      expect(res.status).toBe(404);
      expect(mockBorrarContenido).not.toHaveBeenCalled();
    });

    it("id uuid pero sin fila (ItemNoEncontrado) -> 404, no revalida", async () => {
      mockBorrarContenido.mockRejectedValue(new ItemNoEncontradoMock());
      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(404);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it("happy path (agentes, DELETE real) -> 200 + conAuditoria(accion='borrar_contenido') + revalidateTag UNA vez", async () => {
      mockBorrarContenido.mockResolvedValue({
        resultado: null,
        valorAnterior: { id: UUID, nombre: "Borrado" },
        valorNuevo: null,
      });

      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(200);
      expect(mockConAuditoria).toHaveBeenCalledWith(
        { marker: "admin-client" },
        expect.objectContaining({
          actorId: "admin-1",
          accion: "borrar_contenido",
          entidad: "agentes",
          entidadId: UUID,
        }),
        expect.any(Function),
      );
      expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
      expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
    });

    it("videos: DELETE por HTTP hace soft-delete (delega en actualizarContenido con publicado=false) — cubierto a nivel de negocio en lib/data/admin/contenido.test.ts; acá sólo se confirma que la ruta llama a borrarContenido y no a un delete propio", async () => {
      mockBorrarContenido.mockResolvedValue({
        resultado: { id: UUID, publicado: false },
        valorAnterior: { id: UUID, publicado: true },
        valorNuevo: { id: UUID, publicado: false },
      });

      const res = await callDelete("videos", UUID);
      expect(res.status).toBe(200);
      expect(mockBorrarContenido).toHaveBeenCalledWith({ marker: "admin-client" }, "videos", UUID);
      expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-videos");
    });

    it("una escritura fallida (error inesperado) no revalida nada", async () => {
      mockBorrarContenido.mockRejectedValue(new Error("boom"));
      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(500);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });
  });
});
