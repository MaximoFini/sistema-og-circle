// VGRP-57 — requierePlan(): 401 sin sesión, 403 sin plan, null con plan.
// getVerifiedClaims mockeado, mismo patrón que app/api/agentes/route.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

describe("requierePlan()", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
  });

  it("sin sesión: 401 { error: 'No autenticado.' }", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);
    const { requierePlan } = await import("./guard");

    const res = await requierePlan();

    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ error: "No autenticado." });
  });

  it.each([
    ["nivel 'ninguno'", { app_metadata: { nivel: "ninguno" } }],
    ["sin claim de nivel (token viejo)", { sub: "u1" }],
    ["nivel inventado", { app_metadata: { nivel: "premium" } }],
  ])("%s: 403 con el mensaje de plan", async (_caso, claims) => {
    mockGetVerifiedClaims.mockResolvedValue(claims);
    const { requierePlan } = await import("./guard");

    const res = await requierePlan();

    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Necesitás un plan para usar la calculadora." });
  });

  it.each(["principiante", "avanzado"])("nivel '%s': null (pasa)", async (nivel) => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel } });
    const { requierePlan } = await import("./guard");

    await expect(requierePlan()).resolves.toBeNull();
  });
});
