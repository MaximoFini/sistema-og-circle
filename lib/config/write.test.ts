import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escribirEdgeConfig } from "./write";

// VGRP-40 — `escribirEdgeConfig()` nunca debe propagar una excepción cruda ni
// dejar pasar un error HTTP como si fuera éxito. Mockea `fetch` global —
// nunca pega a la API real de Vercel (no hay store de Edge Config de test
// aislado, mismo criterio que docs/EDGE-CONFIG.md documenta para el store de
// producción).

const ENV_KEYS = [
  "VERCEL_EDGE_CONFIG_ID",
  "VERCEL_EDGE_CONFIG_WRITE_TOKEN",
  "VERCEL_TEAM_ID",
] as const;

// `process.env` es el objeto especial de Node que STRINGIFICA cualquier
// asignación (`process.env.X = undefined` termina siendo la STRING
// "undefined", truthy — no lo mismo que "ausente"). `delete` es la única
// forma correcta de simular "esta env var no está seteada"; reemplazar
// `process.env` entero por un objeto plano (`process.env = {...}`) rompería
// esa stringificación para el resto del archivo — no se hace acá a propósito.
function mockEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("escribirEdgeConfig", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    mockEnv({
      VERCEL_EDGE_CONFIG_ID: "ecfg_test123",
      VERCEL_EDGE_CONFIG_WRITE_TOKEN: "token-de-test",
      VERCEL_TEAM_ID: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("sin VERCEL_EDGE_CONFIG_ID -> ok:false sin llamar a fetch", async () => {
    mockEnv({ VERCEL_EDGE_CONFIG_ID: undefined, VERCEL_EDGE_CONFIG_WRITE_TOKEN: "token" });
    const result = await escribirEdgeConfig([{ key: "precios", value: { principiante: 1 } }]);
    expect(result).toEqual({ ok: false, status: 0, message: expect.any(String) });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sin VERCEL_EDGE_CONFIG_WRITE_TOKEN -> ok:false sin llamar a fetch", async () => {
    mockEnv({ VERCEL_EDGE_CONFIG_ID: "ecfg_test123", VERCEL_EDGE_CONFIG_WRITE_TOKEN: undefined });
    const result = await escribirEdgeConfig([{ key: "flags", value: {} }]);
    expect(result).toEqual({ ok: false, status: 0, message: expect.any(String) });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("200 de Vercel -> ok:true, request con el body/headers correctos", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await escribirEdgeConfig([
      { key: "precios", value: { principiante: 75000, avanzado: 130000 } },
    ]);

    expect(result).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.vercel.com/v1/edge-config/ecfg_test123/items");
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token-de-test" });
    expect(JSON.parse(init.body as string)).toEqual({
      items: [
        { operation: "update", key: "precios", value: { principiante: 75000, avanzado: 130000 } },
      ],
    });
  });

  it("agrega ?teamId cuando VERCEL_TEAM_ID está seteado", async () => {
    mockEnv({
      VERCEL_EDGE_CONFIG_ID: "ecfg_test123",
      VERCEL_EDGE_CONFIG_WRITE_TOKEN: "token-de-test",
      VERCEL_TEAM_ID: "team_abc",
    });
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    await escribirEdgeConfig([{ key: "flags", value: { fase: "2" } }]);

    const [url] = mockFetch.mock.calls[0] as [URL];
    expect(url.searchParams.get("teamId")).toBe("team_abc");
  });

  it("error HTTP de Vercel (4xx/5xx) -> ok:false con el status real, nunca tira", async () => {
    mockFetch.mockResolvedValue(
      new Response("token inválido", { status: 401, statusText: "Unauthorized" }),
    );

    const result = await escribirEdgeConfig([{ key: "precios", value: {} }]);

    expect(result).toEqual({ ok: false, status: 401, message: "token inválido" });
  });

  it("fetch rechaza (error de red) -> ok:false, nunca tira", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    const result = await escribirEdgeConfig([{ key: "flags", value: {} }]);

    expect(result).toEqual({ ok: false, status: 0, message: "network down" });
  });
});
