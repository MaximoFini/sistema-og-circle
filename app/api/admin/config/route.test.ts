// VGRP-40 — tests unitarios de GET|PATCH /api/admin/config.
//
// Mismo estilo que app/api/admin/usuarios/[id]/nivel/route.test.ts: `vi.mock`
// de las dependencias + import dinámico del módulo bajo test. No pega a la
// red, a Supabase ni a la API de Vercel — el foco es el contrato HTTP y que
// la escritura NO se ejecute cuando el guard o la validación fallan, y que el
// audit log NO se escriba cuando la escritura a Edge Config falla.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockGetConfig = vi.fn();
const mockEscribirEdgeConfig = vi.fn();
const mockConAuditoria = vi.fn();
const mockRegistrar = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/config", () => ({
  getConfig: () => mockGetConfig(),
}));

vi.mock("@/lib/config/write", () => ({
  escribirEdgeConfig: (...args: unknown[]) => mockEscribirEdgeConfig(...args),
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

const CONFIG_OK = {
  precios: { ok: true as const, precios: { principiante: 75000, avanzado: 125000 } },
  flags: { checkout_habilitado: false, registro_habilitado: true, fase: "2" as const },
  links: {
    calculadora: "https://vegroup.vercel.app/calculadora",
    whatsapp: "https://wa.me/5491100000000",
    traxcargo: "https://traxcargo.com",
  },
};

function reqPatch(body: unknown): Request {
  return new Request("https://ogcircle.example/api/admin/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callGet() {
  const { GET } = await import("./route");
  return GET();
}

async function callPatch(body: unknown) {
  const { PATCH } = await import("./route");
  return PATCH(reqPatch(body));
}

describe("GET /api/admin/config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireAdmin.mockReset();
    mockGetConfig.mockReset();
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockGetConfig.mockResolvedValue(CONFIG_OK);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión -> 401 y no llama a getConfig", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    });
    const res = await callGet();
    expect(res.status).toBe(401);
    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it("rol != admin -> 404 y no llama a getConfig", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    });
    const res = await callGet();
    expect(res.status).toBe(404);
    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it("admin -> 200 con precios y flags, sin links", async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ precios: CONFIG_OK.precios, flags: CONFIG_OK.flags });
    expect(body.links).toBeUndefined();
  });
});

describe("PATCH /api/admin/config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireAdmin.mockReset();
    mockGetConfig.mockReset();
    mockEscribirEdgeConfig.mockReset();
    mockConAuditoria.mockReset();
    mockRegistrar.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockCaptureException.mockReset();

    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockGetConfig.mockResolvedValue(CONFIG_OK);
    mockEscribirEdgeConfig.mockResolvedValue({ ok: true });
    mockCreateServiceRoleClient.mockReturnValue({});
    mockConAuditoria.mockImplementation(
      async (_admin: unknown, meta: unknown, mutacion: () => Promise<{ resultado: unknown }>) => {
        const r = await mutacion();
        mockRegistrar(meta);
        return r.resultado;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión -> 401 y cero llamadas a escribirEdgeConfig", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    });
    const res = await callPatch({ precios: { principiante: 75000, avanzado: 130000 } });
    expect(res.status).toBe(401);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it("rol != admin -> 404 y cero llamadas a escribirEdgeConfig", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    });
    const res = await callPatch({ flags: CONFIG_OK.flags });
    expect(res.status).toBe(404);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it.each([
    ["cero", { principiante: 0, avanzado: 125000 }],
    ["negativo", { principiante: -5000, avanzado: 125000 }],
    ["no numérico", { principiante: "abc", avanzado: 125000 }],
    ["no entero", { principiante: 75000.5, avanzado: 125000 }],
  ])("precios inválido (%s) -> 400, cero llamadas a escribirEdgeConfig", async (_desc, precios) => {
    const res = await callPatch({ precios });
    expect(res.status).toBe(400);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it("precios ausente en el body -> 400", async () => {
    const res = await callPatch({});
    expect(res.status).toBe(400);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it("body con precios Y flags a la vez -> 400 (una sola clave por request)", async () => {
    const res = await callPatch({ precios: CONFIG_OK.precios.precios, flags: CONFIG_OK.flags });
    expect(res.status).toBe(400);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it("flags.fase fuera del enum -> 400", async () => {
    const res = await callPatch({
      flags: { checkout_habilitado: true, registro_habilitado: true, fase: "5" },
    });
    expect(res.status).toBe(400);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it("éxito con precios -> 200, escribirEdgeConfig(key=precios) y audit con entidadId=precios", async () => {
    const nuevoPrecios = { principiante: 75000, avanzado: 130000 };
    const res = await callPatch({ precios: nuevoPrecios });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      valorAnterior: CONFIG_OK.precios.precios,
      valorNuevo: nuevoPrecios,
    });
    expect(mockEscribirEdgeConfig).toHaveBeenCalledWith([{ key: "precios", value: nuevoPrecios }]);
    expect(mockRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        accion: "actualizar_config",
        entidad: "config",
        entidadId: "precios",
      }),
    );
  });

  it("éxito con flags -> 200, escribirEdgeConfig(key=flags) y audit con entidadId=flags", async () => {
    const nuevoFlags = { checkout_habilitado: true, registro_habilitado: true, fase: "3" as const };
    const res = await callPatch({ flags: nuevoFlags });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valorAnterior: CONFIG_OK.flags, valorNuevo: nuevoFlags });
    expect(mockEscribirEdgeConfig).toHaveBeenCalledWith([{ key: "flags", value: nuevoFlags }]);
    expect(mockRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "config", entidadId: "flags" }),
    );
  });

  it("precios con lectura previa fallida -> valorAnterior null, no bloquea el cambio", async () => {
    mockGetConfig.mockResolvedValue({
      ...CONFIG_OK,
      precios: { ok: false, error: "Edge Config no respondió" },
    });
    const nuevoPrecios = { principiante: 80000, avanzado: 130000 };

    const res = await callPatch({ precios: nuevoPrecios });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valorAnterior: null, valorNuevo: nuevoPrecios });
  });

  it("escribirEdgeConfig falla -> 502, mensaje genérico, Sentry llamado, SIN audit log", async () => {
    mockEscribirEdgeConfig.mockResolvedValue({
      ok: false,
      status: 401,
      message: "token inválido y secreto",
    });

    const res = await callPatch({ precios: { principiante: 75000, avanzado: 130000 } });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("No se pudo guardar en Edge Config. Reintentá.");
    expect(JSON.stringify(body)).not.toContain("token inválido");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockConAuditoria).not.toHaveBeenCalled();
    expect(mockRegistrar).not.toHaveBeenCalled();
  });
});
