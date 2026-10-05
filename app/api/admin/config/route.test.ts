// VGRP-40 — tests unitarios de GET|PATCH /api/admin/config.
//
// Mismo estilo que app/api/admin/usuarios/[id]/nivel/route.test.ts: `vi.mock`
// de las dependencias + import dinámico del módulo bajo test. No pega a la
// red, a Supabase ni a la API de Vercel — el foco es el contrato HTTP y que
// la escritura NO se ejecute cuando el guard o la validación fallan, y que el
// audit log NO se escriba cuando la escritura a Edge Config falla.
//
// VGRP-59/60 (Bloque 13 — plan único): el body de PATCH ahora acepta una de
// TRES claves completas (`precios`, `plan` o `flags`) en vez de dos, y
// `precios` pasó de { principiante, avanzado } a { plan: number }.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockGetPrecios = vi.fn();
const mockGetPlan = vi.fn();
const mockGetFlags = vi.fn();
const mockEscribirEdgeConfig = vi.fn();
const mockConAuditoria = vi.fn();
const mockRegistrar = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/config", () => ({
  getPrecios: () => mockGetPrecios(),
  getPlan: () => mockGetPlan(),
  getFlags: () => mockGetFlags(),
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
  precios: { ok: true as const, precios: { plan: 90000 } },
  plan: { nombre: "Plan X" },
  flags: {
    checkout_habilitado: false,
    registro_habilitado: true,
    fase: "2" as const,
  },
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
    mockGetPrecios.mockReset();
    mockGetPlan.mockReset();
    mockGetFlags.mockReset();
    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockGetPrecios.mockResolvedValue(CONFIG_OK.precios);
    mockGetPlan.mockResolvedValue(CONFIG_OK.plan);
    mockGetFlags.mockResolvedValue(CONFIG_OK.flags);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión -> 401 y no llama a getPrecios/getPlan/getFlags", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    });
    const res = await callGet();
    expect(res.status).toBe(401);
    expect(mockGetPrecios).not.toHaveBeenCalled();
    expect(mockGetPlan).not.toHaveBeenCalled();
    expect(mockGetFlags).not.toHaveBeenCalled();
  });

  it("rol != admin -> 404 y no llama a getPrecios/getPlan/getFlags", async () => {
    mockRequireAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    });
    const res = await callGet();
    expect(res.status).toBe(404);
    expect(mockGetPrecios).not.toHaveBeenCalled();
    expect(mockGetPlan).not.toHaveBeenCalled();
    expect(mockGetFlags).not.toHaveBeenCalled();
  });

  it("admin -> 200 con precios, plan y flags, sin links", async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      precios: CONFIG_OK.precios,
      plan: CONFIG_OK.plan,
      flags: CONFIG_OK.flags,
    });
    expect(body.links).toBeUndefined();
  });
});

describe("PATCH /api/admin/config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequireAdmin.mockReset();
    mockGetPrecios.mockReset();
    mockGetPlan.mockReset();
    mockGetFlags.mockReset();
    mockEscribirEdgeConfig.mockReset();
    mockConAuditoria.mockReset();
    mockRegistrar.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockCaptureException.mockReset();

    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockGetPrecios.mockResolvedValue(CONFIG_OK.precios);
    mockGetPlan.mockResolvedValue(CONFIG_OK.plan);
    mockGetFlags.mockResolvedValue(CONFIG_OK.flags);
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
    const res = await callPatch({ precios: { plan: 95000 } });
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
    ["cero", { plan: 0 }],
    ["negativo", { plan: -5000 }],
    ["no numérico", { plan: "abc" }],
    ["no entero", { plan: 90000.5 }],
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

  it("body con precios Y plan a la vez -> 400 (una sola clave por request)", async () => {
    const res = await callPatch({ precios: CONFIG_OK.precios.precios, plan: CONFIG_OK.plan });
    expect(res.status).toBe(400);
    expect(mockEscribirEdgeConfig).not.toHaveBeenCalled();
  });

  it("plan.nombre vacío -> 400", async () => {
    const res = await callPatch({ plan: { nombre: "" } });
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
    const nuevoPrecios = { plan: 95000 };
    const res = await callPatch({ precios: nuevoPrecios });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      valorAnterior: CONFIG_OK.precios.precios,
      valorNuevo: nuevoPrecios,
    });
    expect(mockEscribirEdgeConfig).toHaveBeenCalledWith([{ key: "precios", value: nuevoPrecios }]);
    expect(mockGetPlan).not.toHaveBeenCalled(); // sólo se lee la clave que cambia
    expect(mockGetFlags).not.toHaveBeenCalled();
    expect(mockRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        accion: "actualizar_config",
        entidad: "config",
        entidadId: "precios",
      }),
    );
  });

  it("éxito con plan -> 200, escribirEdgeConfig(key=plan) y audit con entidadId=plan", async () => {
    const nuevoPlan = { nombre: "Plan Og Circle" };
    const res = await callPatch({ plan: nuevoPlan });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valorAnterior: CONFIG_OK.plan, valorNuevo: nuevoPlan });
    expect(mockEscribirEdgeConfig).toHaveBeenCalledWith([{ key: "plan", value: nuevoPlan }]);
    expect(mockGetPrecios).not.toHaveBeenCalled(); // sólo se lee la clave que cambia
    expect(mockGetFlags).not.toHaveBeenCalled();
    expect(mockRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "config", entidadId: "plan" }),
    );
  });

  it("éxito con flags -> 200, escribirEdgeConfig(key=flags) y audit con entidadId=flags", async () => {
    const nuevoFlags = {
      checkout_habilitado: true,
      registro_habilitado: true,
      fase: "3" as const,
    };
    const res = await callPatch({ flags: nuevoFlags });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valorAnterior: CONFIG_OK.flags, valorNuevo: nuevoFlags });
    expect(mockEscribirEdgeConfig).toHaveBeenCalledWith([{ key: "flags", value: nuevoFlags }]);
    expect(mockGetPrecios).not.toHaveBeenCalled(); // sólo se lee la clave que cambia
    expect(mockGetPlan).not.toHaveBeenCalled();
    expect(mockRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: "config", entidadId: "flags" }),
    );
  });

  it("precios con lectura previa fallida -> valorAnterior null, no bloquea el cambio", async () => {
    mockGetPrecios.mockResolvedValue({ ok: false, error: "Edge Config no respondió" });
    const nuevoPrecios = { plan: 98000 };

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

    const res = await callPatch({ precios: { plan: 95000 } });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("No se pudo guardar en Edge Config. Reintentá.");
    expect(JSON.stringify(body)).not.toContain("token inválido");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockConAuditoria).not.toHaveBeenCalled();
    expect(mockRegistrar).not.toHaveBeenCalled();
  });
});
