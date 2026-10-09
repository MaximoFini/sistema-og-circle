// VGRP-88 — descargarMaterial, mockeado (sin base ni Storage): la barrera del plan, que solo
// se descargan materiales publicados, el nombre del archivo y los errores amigables.
// `tieneAcceso` es el real: lo que se prueba es la decisión de verdad, no un mock de ella.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();
const mockUrlDescarga = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));
vi.mock("@/lib/materiales/storage", () => ({
  urlDescarga: (...args: unknown[]) => mockUrlDescarga(...args),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    const cadena = {
      select: () => cadena,
      eq: (...args: unknown[]) => {
        mockEq(...args);
        return cadena;
      },
      maybeSingle: () => mockMaybeSingle(),
    };
    return { from: () => cadena };
  },
}));

const { descargarMaterial } = await import("./_actions");

const ID = "123e4567-e89b-12d3-a456-426614174000";
const CON_PLAN = { sub: "u1", app_metadata: { nivel: "completo" } };
const SIN_PLAN = { sub: "u1", app_metadata: { nivel: "ninguno" } };

beforeEach(() => {
  for (const m of [
    mockGetVerifiedClaims,
    mockUrlDescarga,
    mockMaybeSingle,
    mockEq,
    mockCaptureException,
  ]) {
    m.mockReset();
  }
  mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
  mockMaybeSingle.mockResolvedValue({
    data: { storage_path: "archivos/a.pdf", titulo: "Guía de importación", extension: "pdf" },
    error: null,
  });
  mockUrlDescarga.mockResolvedValue("https://storage/firmada?token=t");
});

describe("descargarMaterial", () => {
  it("sin sesión -> error, sin leer la base ni Storage", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    await expect(descargarMaterial(ID)).resolves.toEqual({
      ok: false,
      error: "Tenés que iniciar sesión.",
    });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockUrlDescarga).not.toHaveBeenCalled();
  });

  it("US-6 — sin plan -> error y NUNCA se firma una URL", async () => {
    mockGetVerifiedClaims.mockResolvedValue(SIN_PLAN);

    await expect(descargarMaterial(ID)).resolves.toEqual({
      ok: false,
      error: "Necesitás el plan para descargar.",
    });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    expect(mockUrlDescarga).not.toHaveBeenCalled();
  });

  it("un token viejo con nivel 'avanzado' cuenta como plan (mismo criterio que tieneAcceso)", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ sub: "u1", app_metadata: { nivel: "avanzado" } });

    await expect(descargarMaterial(ID)).resolves.toMatchObject({ ok: true });
  });

  it.each(["no-es-uuid", "", "1; drop table materiales"])(
    "id inválido (%s) -> 'ya no está disponible', sin tocar la base",
    async (id) => {
      await expect(descargarMaterial(id)).resolves.toEqual({
        ok: false,
        error: "Este material ya no está disponible.",
      });
      expect(mockMaybeSingle).not.toHaveBeenCalled();
    },
  );

  it("solo busca entre los PUBLICADOS: un material oculto no se descarga aunque se sepa su id", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(descargarMaterial(ID)).resolves.toEqual({
      ok: false,
      error: "Este material ya no está disponible.",
    });
    expect(mockEq).toHaveBeenCalledWith("id", ID);
    expect(mockEq).toHaveBeenCalledWith("publicado", true);
    expect(mockUrlDescarga).not.toHaveBeenCalled();
  });

  it("ok -> URL firmada por 120 s con el título como nombre de archivo", async () => {
    await expect(descargarMaterial(ID)).resolves.toEqual({
      ok: true,
      url: "https://storage/firmada?token=t",
    });
    expect(mockUrlDescarga).toHaveBeenCalledWith("archivos/a.pdf", "Guía de importación.pdf", 120);
  });

  it("si Storage no firma -> error amigable", async () => {
    mockUrlDescarga.mockResolvedValue(null);

    await expect(descargarMaterial(ID)).resolves.toEqual({
      ok: false,
      error: "No pudimos generar la descarga. Probá de nuevo.",
    });
  });

  it("si la base falla -> error amigable y aviso a Sentry, sin tirar", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error("base caída") });

    await expect(descargarMaterial(ID)).resolves.toEqual({
      ok: false,
      error: "No pudimos generar la descarga. Probá de nuevo.",
    });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
