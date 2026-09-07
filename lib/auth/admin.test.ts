// VGRP-35 / VGRP-47 §1 — tests unitarios de `requireAdmin()` y
// `requireAdminPage()` (lib/auth/admin.ts).
//
// Mismo estilo que `app/api/admin/usuarios/[id]/nivel/route.test.ts`:
// `vi.mock` + `vi.resetModules()` + import dinámico del módulo bajo test. No
// pega a la red ni a Supabase — se mockea `getVerifiedClaims` (el único punto
// de I/O de estos guards) y `next/navigation` (`redirect`/`notFound`, que en
// Next cortan el flujo lanzando — se simula igual acá).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();
const mockRedirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

async function importAdmin() {
  return import("./admin");
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockRedirect.mockClear();
    mockNotFound.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión (claims null) -> {ok:false} con response 401", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);
    const { requireAdmin } = await importAdmin();

    const guard = await requireAdmin();

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(401);
    }
  });

  it("rol != 'admin' -> {ok:false} con response 404 (nunca 403)", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "user-1",
      app_metadata: { rol: "user" },
    });
    const { requireAdmin } = await importAdmin();

    const guard = await requireAdmin();

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(404);
      expect(guard.response.status).not.toBe(403);
    }
  });

  it("claim 'sub' vacío, aunque rol === 'admin' -> también 404", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "",
      app_metadata: { rol: "admin" },
    });
    const { requireAdmin } = await importAdmin();

    const guard = await requireAdmin();

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(404);
    }
  });

  it("claim 'sub' no-string, aunque rol === 'admin' -> también 404", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: 12345,
      app_metadata: { rol: "admin" },
    });
    const { requireAdmin } = await importAdmin();

    const guard = await requireAdmin();

    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(404);
    }
  });

  it("happy path -> {ok:true, actorId} con el actorId correcto", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "admin-123",
      app_metadata: { rol: "admin" },
    });
    const { requireAdmin } = await importAdmin();

    const guard = await requireAdmin();

    expect(guard).toEqual({ ok: true, actorId: "admin-123" });
  });
});

describe("requireAdminPage", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockRedirect.mockClear();
    mockNotFound.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin sesión -> llama a redirect('/login?next=/admin')", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);
    const { requireAdminPage } = await importAdmin();

    await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mockRedirect).toHaveBeenCalledWith("/login?next=/admin");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("rol != admin -> llama a notFound()", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "user-1",
      app_metadata: { rol: "user" },
    });
    const { requireAdminPage } = await importAdmin();

    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("sub vacío (aunque rol === 'admin') -> llama a notFound()", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "",
      app_metadata: { rol: "admin" },
    });
    const { requireAdminPage } = await importAdmin();

    await expect(requireAdminPage()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("happy path -> no redirige ni corta, devuelve el actorId", async () => {
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "admin-123",
      app_metadata: { rol: "admin" },
    });
    const { requireAdminPage } = await importAdmin();

    const out = await requireAdminPage();

    expect(out).toEqual({ actorId: "admin-123" });
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
