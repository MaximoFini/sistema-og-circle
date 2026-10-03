// VGRP-62 — tests unitarios (mockeados) de PATCH /api/admin/cuentas/[id].

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockRequireAdmin = vi.fn();
const mockActualizarCuenta = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockCaptureException = vi.fn();

const ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/lib/data/admin/cuentas", () => ({
  CuentaNoEncontrada: class CuentaNoEncontrada extends Error {},
  actualizarCuenta: (...args: unknown[]) => mockActualizarCuenta(...args),
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

function req(body?: unknown): Request {
  return new Request(`https://ogcircle.example/api/admin/cuentas/${ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callPatch(id: string, body?: unknown) {
  const { PATCH } = await import("./route");
  return PATCH(req(body), { params: Promise.resolve({ id }) });
}

function zodErrorReal(): z.ZodError {
  const r = z.object({ alias: z.string().min(6) }).safeParse({ alias: "x" });
  if (r.success) throw new Error("se esperaba que este parse fallara");
  return r.error;
}

describe("PATCH /api/admin/cuentas/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      mockRequireAdmin,
      mockActualizarCuenta,
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
  ])("%s: devuelve %i sin tocar la base ni el audit log", async (_caso, status) => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "x" }, { status }),
    });

    const res = await callPatch(ID, { alias: "abcdef" });

    expect(res.status).toBe(status);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockActualizarCuenta).not.toHaveBeenCalled();
    expect(mockConAuditoria).not.toHaveBeenCalled();
  });

  it("404 si :id no es un uuid, sin tocar la base", async () => {
    const res = await callPatch("no-es-uuid", { alias: "abcdef" });

    expect(res.status).toBe(404);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockConAuditoria).not.toHaveBeenCalled();
  });

  it("200: actualiza dentro de conAuditoria con la acción, el actor y el id correctos", async () => {
    mockActualizarCuenta.mockResolvedValue({ resultado: { id: ID, alias: "nuevo.alias" } });

    const res = await callPatch(ID, { alias: "nuevo.alias" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: ID, alias: "nuevo.alias" });
    expect(mockConAuditoria).toHaveBeenCalledWith(
      { marker: "admin-client" },
      {
        actorId: "admin-1",
        accion: "editar_cuenta_cobro",
        entidad: "cuentas_cobro",
        entidadId: ID,
      },
      expect.any(Function),
    );
    expect(mockActualizarCuenta).toHaveBeenCalledWith({ marker: "admin-client" }, ID, {
      alias: "nuevo.alias",
    });
  });

  it("404 si la cuenta no existe", async () => {
    const { CuentaNoEncontrada } = await import("@/lib/data/admin/cuentas");
    mockActualizarCuenta.mockRejectedValue(new CuentaNoEncontrada("x"));

    const res = await callPatch(ID, { alias: "abcdef" });

    expect(res.status).toBe(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("400 con fieldErrors si el body es inválido", async () => {
    mockActualizarCuenta.mockRejectedValue(zodErrorReal());

    const res = await callPatch(ID, { alias: "x" });

    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.alias).toBeDefined();
  });

  it("500 genérico y Sentry ante un error inesperado", async () => {
    mockActualizarCuenta.mockRejectedValue(new Error("fallo de red"));

    const res = await callPatch(ID, { alias: "abcdef" });

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("fallo de red");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
