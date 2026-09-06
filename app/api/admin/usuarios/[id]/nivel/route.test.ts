// VGRP-36 — tests unitarios de `POST /api/admin/usuarios/[id]/nivel`.
//
// Mismo estilo que `app/api/webhooks/mercadopago/route.test.ts`: `vi.mock` de
// las dependencias (`lib/data/admin/*`, `requireAdmin`, `createServiceRoleClient`)
// + import dinámico del módulo bajo test tras `vi.resetModules()`. No pega a la
// red ni a Supabase — el foco es el contrato HTTP (401/404/400/200) y que la
// lógica de negocio NO se ejecute cuando el guard o la validación fallan.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class UsuarioNoEncontradoMock extends Error {
  constructor() {
    super("no existe");
    this.name = "UsuarioNoEncontrado";
  }
}

const mockRequireAdmin = vi.fn();
const mockActivarNivel = vi.fn();
const mockRegistrar = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/data/admin/usuarios", () => ({
  activarNivel: (...args: unknown[]) => mockActivarNivel(...args),
  UsuarioNoEncontrado: UsuarioNoEncontradoMock,
}));

vi.mock("@/lib/data/admin/audit-log", () => ({
  conAuditoria: (...args: unknown[]) => mockConAuditoria(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

const UUID = "11111111-1111-4111-8111-111111111111";

function req(body: unknown): Request {
  return new Request(`https://ogcircle.example/api/admin/usuarios/${UUID}/nivel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(body: unknown, id = UUID) {
  const { POST } = await import("./route");
  return POST(req(body), { params: Promise.resolve({ id }) });
}

describe("POST /api/admin/usuarios/[id]/nivel", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireAdmin.mockReset();
    mockActivarNivel.mockReset();
    mockRegistrar.mockReset();
    mockConAuditoria.mockReset();
    mockCreateServiceRoleClient.mockReset();

    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockCreateServiceRoleClient.mockReturnValue({});
    mockConAuditoria.mockImplementation(
      async (_admin: unknown, meta: unknown, mutacion: () => Promise<{ resultado: unknown }>) => {
        const r = await mutacion();
        mockRegistrar(meta);
        return r.resultado;
      },
    );
    mockActivarNivel.mockResolvedValue({
      resultado: { nivelAnterior: "ninguno", nivelNuevo: "avanzado" },
      valorAnterior: { nivel: "ninguno" },
      valorNuevo: { nivel: "avanzado", motivo: "ok" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión -> 401 y no llama a activarNivel", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    });
    const res = await call({ nivel: "avanzado", motivo: "x" });
    expect(res.status).toBe(401);
    expect(mockActivarNivel).not.toHaveBeenCalled();
  });

  it("rol != admin -> 404 y no llama a activarNivel", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    });
    const res = await call({ nivel: "avanzado", motivo: "x" });
    expect(res.status).toBe(404);
    expect(mockActivarNivel).not.toHaveBeenCalled();
  });

  it("body sin motivo -> 400", async () => {
    const res = await call({ nivel: "avanzado" });
    expect(res.status).toBe(400);
    expect(mockActivarNivel).not.toHaveBeenCalled();
  });

  it("motivo en blanco -> 400", async () => {
    const res = await call({ nivel: "avanzado", motivo: "   " });
    expect(res.status).toBe(400);
    expect(mockActivarNivel).not.toHaveBeenCalled();
  });

  it("nivel fuera del enum -> 400", async () => {
    const res = await call({ nivel: "superadmin", motivo: "x" });
    expect(res.status).toBe(400);
    expect(mockActivarNivel).not.toHaveBeenCalled();
  });

  it("id no-uuid -> 404", async () => {
    const res = await call({ nivel: "avanzado", motivo: "x" }, "no-es-uuid");
    expect(res.status).toBe(404);
    expect(mockActivarNivel).not.toHaveBeenCalled();
  });

  it("usuario inexistente (activarNivel lanza UsuarioNoEncontrado) -> 404 sin audit", async () => {
    mockActivarNivel.mockRejectedValue(new UsuarioNoEncontradoMock());
    const res = await call({ nivel: "avanzado", motivo: "x" });
    expect(res.status).toBe(404);
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("happy path -> 200 y conAuditoria con accion='cambiar_nivel', entidad='profiles'", async () => {
    const res = await call({ nivel: "avanzado", motivo: "pagó por transferencia" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "avanzado" });
    expect(mockConAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "admin-1",
        accion: "cambiar_nivel",
        entidad: "profiles",
        entidadId: UUID,
      }),
      expect.any(Function),
    );
  });
});
