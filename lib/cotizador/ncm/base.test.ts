// loadBase(): lo único de base.ts que NO es literal del original (fetch en
// vez de import()). La paridad de los datos la cubre search.test.ts; acá se
// fija el contrato de la descarga: URL versionada, una sola descarga aunque
// haya llamadas simultáneas, y reintento después de un fallo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BaseNcmCruda } from "../types";

const BASE_MINIMA: BaseNcmCruda = [
  {
    ncm: "8518.30.00",
    descripcion: "Auriculares",
    suf: [["100U", "Inalámbricos", 16, 3, 21, 20, "", "Sí", "9.5"]],
  },
];

// Estado memoizado a nivel módulo: cada test importa una instancia nueva.
async function importarBase() {
  vi.resetModules();
  return import("./base");
}

const respuesta = (ok: boolean, cuerpo: unknown = BASE_MINIMA) =>
  ({ ok, status: ok ? 200 : 503, json: async () => cuerpo }) as Response;

describe("loadBase()", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("baja /cotizador/ncm-2026-1.json una sola vez aunque la pidan dos a la vez", async () => {
    fetchMock.mockResolvedValue(respuesta(true));
    const { loadBase, getNcm } = await importarBase();

    const [a, b] = await Promise.all([loadBase(), loadBase()]);
    await loadBase();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/cotizador/ncm-2026-1.json");
    expect(a).toBe(b);
    expect(getNcm("8518.30.00.100U")).toEqual({
      sim: "8518.30.00.100U",
      ncm: "8518.30.00",
      sufijo: "100U",
      descripcion: "Inalámbricos. Auriculares",
      descripcionSufijo: "Inalámbricos",
      die: 16,
      te: 3,
      iva: 21,
      ivaAd: 20,
      lic: "",
      antidumping: "Sí",
      impInternos: "9.5",
    });
  });

  it("si la descarga falla, rechaza y el próximo intento vuelve a pedirla", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(false)).mockResolvedValueOnce(respuesta(true));
    const { loadBase, getNcm } = await importarBase();

    await expect(loadBase()).rejects.toThrow("HTTP 503");
    expect(getNcm("8518.30.00")).toBeNull();

    await expect(loadBase()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("getNcm() devuelve null mientras la base no está cargada, como el original", async () => {
    const { getNcm } = await importarBase();
    expect(getNcm("8518.30.00.100U")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
