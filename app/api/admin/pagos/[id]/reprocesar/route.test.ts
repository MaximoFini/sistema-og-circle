// VGRP-37 — tests unitarios de `POST /api/admin/pagos/[id]/reprocesar`.
//
// Mismo estilo que `app/api/admin/usuarios/[id]/nivel/route.test.ts`: `vi.mock`
// de las dependencias (`lib/data/admin/*`, `requireAdmin`,
// `createServiceRoleClient`) + import dinámico del módulo bajo test tras
// `vi.resetModules()`. No pega a la red ni a Supabase — el foco es el contrato
// HTTP (401/404/409/200) y que la lógica NO se ejecute cuando el guard o la
// validación fallan.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class PagoNoEncontradoMock extends Error {
  constructor() {
    super("no existe");
    this.name = "PagoNoEncontrado";
  }
}
class PagoNoReprocesableMock extends Error {
  constructor() {
    super("no reprocesable");
    this.name = "PagoNoReprocesable";
  }
}

const mockRequireAdmin = vi.fn();
const mockReprocesarPago = vi.fn();
const mockRegistrar = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/data/admin/pagos", () => ({
  reprocesarPago: (...args: unknown[]) => mockReprocesarPago(...args),
  PagoNoEncontrado: PagoNoEncontradoMock,
  PagoNoReprocesable: PagoNoReprocesableMock,
}));

vi.mock("@/lib/data/admin/audit-log", () => ({
  conAuditoria: (...args: unknown[]) => mockConAuditoria(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

const UUID = "22222222-2222-4222-8222-222222222222";

function req(): Request {
  return new Request(`https://ogcircle.example/api/admin/pagos/${UUID}/reprocesar`, {
    method: "POST",
  });
}

async function call(id = UUID) {
  const { POST } = await import("./route");
  return POST(req(), { params: Promise.resolve({ id }) });
}

describe("POST /api/admin/pagos/[id]/reprocesar", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireAdmin.mockReset();
    mockReprocesarPago.mockReset();
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
    mockReprocesarPago.mockResolvedValue({
      resultado: { nivelAnterior: "ninguno", nivelNuevo: "avanzado" },
      valorAnterior: { nivel: "ninguno" },
      valorNuevo: { nivel: "avanzado" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión -> 401 y no llama a reprocesarPago", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    });
    const res = await call();
    expect(res.status).toBe(401);
    expect(mockReprocesarPago).not.toHaveBeenCalled();
  });

  it("rol != admin -> 404 y no llama a reprocesarPago", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    });
    const res = await call();
    expect(res.status).toBe(404);
    expect(mockReprocesarPago).not.toHaveBeenCalled();
  });

  it("id no-uuid -> 404 y no llama a reprocesarPago", async () => {
    const res = await call("no-es-uuid");
    expect(res.status).toBe(404);
    expect(mockReprocesarPago).not.toHaveBeenCalled();
  });

  it("pago inexistente -> 404 sin audit", async () => {
    mockReprocesarPago.mockRejectedValue(new PagoNoEncontradoMock());
    const res = await call();
    expect(res.status).toBe(404);
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("estado != 'approved' -> 409 sin audit y sin cambios", async () => {
    mockReprocesarPago.mockRejectedValue(new PagoNoReprocesableMock());
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Sólo se puede reprocesar un pago aprobado." });
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("happy path -> 200 y conAuditoria con accion='reprocesar_pago', entidad='pagos'", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "avanzado" });
    expect(mockConAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "admin-1",
        accion: "reprocesar_pago",
        entidad: "pagos",
        entidadId: UUID,
      }),
      expect.any(Function),
    );
  });
});
