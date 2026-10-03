// VGRP-62 — tests unitarios (mockeados) de GET|POST /api/admin/cuentas. Mismo
// estilo que app/api/admin/contenido/[entidad]/route.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockRequireAdmin = vi.fn();
const mockListarCuentas = vi.fn();
const mockCrearCuenta = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/lib/data/admin/cuentas", () => ({
  listarCuentas: (...args: unknown[]) => mockListarCuentas(...args),
  crearCuenta: (...args: unknown[]) => mockCrearCuenta(...args),
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

function req(method: "POST", body?: unknown): Request {
  return new Request("https://ogcircle.example/api/admin/cuentas", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function zodErrorReal(): z.ZodError {
  const r = z.object({ alias: z.string().min(6) }).safeParse({ alias: "x" });
  if (r.success) throw new Error("se esperaba que este parse fallara");
  return r.error;
}

describe("GET|POST /api/admin/cuentas", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      mockRequireAdmin,
      mockListarCuentas,
      mockCrearCuenta,
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

  describe("guard de admin", () => {
    it.each([
      ["sin sesión", 401],
      ["rol != admin", 404],
    ])("%s: devuelve %i sin tocar la base ni el audit log", async (_caso, status) => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "x" }, { status }),
      });
      const { GET, POST } = await import("./route");

      const get = await GET();
      const post = await POST(req("POST", { alias: "abcdef" }));

      expect(get.status).toBe(status);
      expect(post.status).toBe(status);
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(mockListarCuentas).not.toHaveBeenCalled();
      expect(mockCrearCuenta).not.toHaveBeenCalled();
      expect(mockConAuditoria).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("200 con { items }", async () => {
      mockListarCuentas.mockResolvedValue([{ id: "c1" }]);
      const { GET } = await import("./route");

      const res = await GET();

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [{ id: "c1" }] });
    });

    it("500 genérico y Sentry si la lectura falla", async () => {
      mockListarCuentas.mockRejectedValue(new Error("boom"));
      const { GET } = await import("./route");

      const res = await GET();

      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain("boom");
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST", () => {
    it("200: crea la cuenta dentro de conAuditoria con la acción y el actor correctos", async () => {
      mockCrearCuenta.mockResolvedValue({ resultado: { id: "c1", activa: false } });
      const body = { alias: "abcdef" };
      const { POST } = await import("./route");

      const res = await POST(req("POST", body));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "c1", activa: false });
      expect(mockConAuditoria).toHaveBeenCalledWith(
        { marker: "admin-client" },
        { actorId: "admin-1", accion: "crear_cuenta_cobro", entidad: "cuentas_cobro" },
        expect.any(Function),
      );
      expect(mockCrearCuenta).toHaveBeenCalledWith({ marker: "admin-client" }, body);
    });

    it("400 con fieldErrors si el body es inválido", async () => {
      mockCrearCuenta.mockRejectedValue(zodErrorReal());
      const { POST } = await import("./route");

      const res = await POST(req("POST", { alias: "x" }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Datos inválidos.");
      expect(json.fieldErrors.alias).toBeDefined();
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("un body que no es JSON llega como null a la validación (no rompe)", async () => {
      mockCrearCuenta.mockRejectedValue(zodErrorReal());
      const { POST } = await import("./route");

      const res = await POST(
        new Request("https://ogcircle.example/api/admin/cuentas", {
          method: "POST",
          body: "no-es-json",
        }),
      );

      expect(res.status).toBe(400);
      expect(mockCrearCuenta).toHaveBeenCalledWith({ marker: "admin-client" }, null);
    });

    it("500 genérico y Sentry ante un error inesperado", async () => {
      mockCrearCuenta.mockRejectedValue(new Error("fallo de red"));
      const { POST } = await import("./route");

      const res = await POST(req("POST", { alias: "abcdef" }));

      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain("fallo de red");
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });
  });
});
