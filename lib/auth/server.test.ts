// VGRP-54 punto 2 — tests de `getVerifiedClaims()`: el fast-path que lee los
// claims que `middleware.ts` ya verificó (header `CLAIMS_HEADER`), con
// fallback a la verificación completa (`supabase.auth.getClaims()`) cuando el
// header no vino o vino corrupto. Mockea `next/headers` y `@supabase/ssr` —
// mismo estilo que middleware.test.ts, sin pegarle a ningún proyecto real.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeClaims } from "./claims-header";

const mockGetClaims = vi.fn();
const mockHeadersGet = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: mockGetClaims },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => ({ get: mockHeadersGet }),
}));

async function importServer() {
  return import("./server");
}

describe("getVerifiedClaims", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetClaims.mockReset();
    mockHeadersGet.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://hsmodrhbwkromoixrxrt.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave-de-prueba-no-real");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("header presente y válido: usa esos claims y NUNCA llama a getClaims() (fast-path)", async () => {
    const claims = { sub: "u1", app_metadata: { nivel: "avanzado" } };
    mockHeadersGet.mockReturnValue(encodeClaims(claims));
    const { getVerifiedClaims } = await importServer();

    const result = await getVerifiedClaims();

    expect(result).toEqual(claims);
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it("header ausente (sin middleware delante, p. ej. un test que llama el handler directo): cae a la verificación completa", async () => {
    mockHeadersGet.mockReturnValue(null);
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u2" } }, error: null });
    const { getVerifiedClaims } = await importServer();

    const result = await getVerifiedClaims();

    expect(result).toEqual({ sub: "u2" });
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
  });

  it("header corrupto (no decodifica a JSON válido): nunca lo usa a ciegas — cae a la verificación completa", async () => {
    mockHeadersGet.mockReturnValue("esto-no-es-base64-json-válido");
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u3" } }, error: null });
    const { getVerifiedClaims } = await importServer();

    const result = await getVerifiedClaims();

    expect(result).toEqual({ sub: "u3" });
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
  });

  it("sin header y sin sesión real: null (fail-closed), sin lanzar", async () => {
    mockHeadersGet.mockReturnValue(null);
    mockGetClaims.mockResolvedValue({ data: undefined, error: { message: "no session" } });
    const { getVerifiedClaims } = await importServer();

    const result = await getVerifiedClaims();

    expect(result).toBeNull();
  });
});
