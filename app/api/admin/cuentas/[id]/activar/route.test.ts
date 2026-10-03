// VGRP-62 — tests unitarios (mockeados) de POST /api/admin/cuentas/[id]/activar.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockActivarCuenta = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockCaptureException = vi.fn();

const ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/lib/data/admin/cuentas", () => ({
  CuentaNoEncontrada: class CuentaNoEncontrada extends Error {},
  activarCuenta: (...args: unknown[]) => mockActivarCuenta(...args),
}));
vi.mock("@/lib/data/admin/audit-log", () => ({
  conAuditoria: (...args: unknown[]) => mockConAuditoria(...args),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

async function callPost(id: string) {
  const { POST } = await import("./route");
  return POST(
    new Request(`https://ogcircle.example/api/admin/cuentas/${id}/activar`, { method: "POST" }),
    {
      params: Promise.resolve({ id }),
    },
  );
}

describe("POST /api/admin/cuentas/[id]/activar", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      mockRequireAdmin,
      mockActivarCuenta,
      mockConAuditoria,
      mockCreateServiceRoleClient,
      mockCaptureException,
    ]) {
      m.mockReset();
    }
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockCreateServiceRoleClient.mockReturnValue({ marker: "admin-client" });
    mockConAuditoria.mockImplementation(
      async (_admin: unknown, _meta: unknown, mutacion: () => Promise<{ resultado: unknown }>) =>
        (await mutacion()).resultado,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["sin sesión", 401],
    ["rol != admin", 404],
  ])("%s: devuelve %i sin activar nada ni auditar", async (_caso, status) => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "x" }, { status }),
    });

    const res = await callPost(ID);

    expect(res.status).toBe(status);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockActivarCuenta).not.toHaveBeenCalled();
    expect(mockConAuditoria).not.toHaveBeenCalled();
  });

  it("404 si :id no es un uuid, sin tocar la base", async () => {
    const res = await callPost("no-es-uuid");

    expect(res.status).toBe(404);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockActivarCuenta).not.toHaveBeenCalled();
  });

  it("200: activa dentro de conAuditoria con la acción, el actor y el id correctos", async () => {
    mockActivarCuenta.mockResolvedValue({ resultado: { id: ID, activa: true } });

    const res = await callPost(ID);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, activa: true });
    expect(mockConAuditoria).toHaveBeenCalledWith(
      { marker: "admin-client" },
      {
        actorId: "admin-1",
        accion: "activar_cuenta_cobro",
        entidad: "cuentas_cobro",
        entidadId: ID,
      },
      expect.any(Function),
    );
    expect(mockActivarCuenta).toHaveBeenCalledWith({ marker: "admin-client" }, ID);
  });

  it("404 si la cuenta no existe, sin Sentry", async () => {
    const { CuentaNoEncontrada } = await import("@/lib/data/admin/cuentas");
    mockActivarCuenta.mockRejectedValue(new CuentaNoEncontrada("x"));

    const res = await callPost(ID);

    expect(res.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("500 genérico y Sentry ante un error inesperado", async () => {
    mockActivarCuenta.mockRejectedValue(new Error("fallo de red"));

    const res = await callPost(ID);

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("fallo de red");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
