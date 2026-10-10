// VGRP-88 — lib/data/materiales.ts sin base: el mapeo fila → MaterialItem, la forma de la
// consulta (en particular que NUNCA pida `storage_path`) y el fail-open con el fallo sin
// cachear. Contra Supabase real: materiales.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock, limiteMock, selectMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  limiteMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

// Misma idea que videos-fallback.test.ts: cachea por argumentos pero SOLO una resolución
// exitosa, nunca un rechazo — así se ancla que el catch está afuera de unstable_cache.
vi.mock("next/cache", () => ({
  unstable_cache: (cb: (...args: unknown[]) => Promise<unknown>) => {
    const cache = new Map<string, unknown>();
    return async (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) return cache.get(key);
      const result = await cb(...args);
      cache.set(key, result);
      return result;
    };
  },
}));

vi.mock("../supabase/service-role", () => ({
  createServiceRoleClient: () => {
    const cadena = {
      select: (...args: unknown[]) => {
        selectMock(...args);
        return cadena;
      },
      eq: () => cadena,
      order: () => cadena,
      limit: limiteMock,
    };
    return { from: () => cadena };
  },
}));

const { aMaterialItem, listarMaterialesPublicados, obtenerMateriales } = await import(
  "./materiales"
);

function fila(extra: Record<string, unknown> = {}) {
  return {
    id: "m1",
    titulo: "Checklist",
    descripcion: null,
    extension: "pdf",
    tamano_bytes: 2_400_000,
    ...extra,
  };
}

beforeEach(() => {
  captureExceptionMock.mockReset();
  limiteMock.mockReset();
  selectMock.mockReset();
});

describe("aMaterialItem", () => {
  it("deriva el tipo de la extensión", () => {
    const casos: [string, string][] = [
      ["pdf", "pdf"],
      ["ppt", "powerpoint"],
      ["pptx", "powerpoint"],
      ["xls", "excel"],
      ["xlsx", "excel"],
      ["csv", "excel"],
      ["doc", "word"],
      ["docx", "word"],
    ];
    for (const [extension, tipo] of casos) {
      expect(aMaterialItem(fila({ extension }))?.tipo).toBe(tipo);
    }
  });

  it("devuelve solo lo que ve el usuario (sin storage_path ni campos internos)", () => {
    expect(aMaterialItem(fila({ storage_path: "archivos/secreto.pdf", orden: 3 }))).toEqual({
      id: "m1",
      titulo: "Checklist",
      descripcion: null,
      tipo: "pdf",
      extension: "pdf",
      tamanoBytes: 2_400_000,
    });
  });

  it("descarta una extensión fuera de la lista en vez de mostrarla rota", () => {
    expect(aMaterialItem(fila({ extension: "exe" }))).toBeNull();
    expect(aMaterialItem(fila({ extension: "constructor" }))).toBeNull();
    expect(aMaterialItem(fila({ extension: "" }))).toBeNull();
  });

  it("el tamaño llega como número aunque la base lo mande como string (bigint)", () => {
    expect(aMaterialItem(fila({ tamano_bytes: "2400000" }))?.tamanoBytes).toBe(2_400_000);
  });
});

describe("listarMaterialesPublicados", () => {
  it("nunca pide storage_path y pone un límite explícito", async () => {
    limiteMock.mockResolvedValue({ data: [fila()], error: null });
    const admin = (await import("../supabase/service-role")).createServiceRoleClient();

    const items = await listarMaterialesPublicados(
      admin as unknown as Parameters<typeof listarMaterialesPublicados>[0],
    );

    expect(items).toHaveLength(1);
    const columnas = selectMock.mock.calls[0]?.[0] as string;
    expect(columnas).not.toContain("storage_path");
    expect(limiteMock).toHaveBeenCalledWith(200);
  });

  it("saltea las filas con extensión inválida y conserva el resto, en orden", async () => {
    limiteMock.mockResolvedValue({
      data: [fila({ id: "a" }), fila({ id: "b", extension: "zip" }), fila({ id: "c" })],
      error: null,
    });
    const admin = (await import("../supabase/service-role")).createServiceRoleClient();

    const items = await listarMaterialesPublicados(
      admin as unknown as Parameters<typeof listarMaterialesPublicados>[0],
    );

    expect(items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("obtenerMateriales — fail-open", () => {
  it("si la base falla devuelve [] y avisa a Sentry en vez de propagar", async () => {
    limiteMock.mockResolvedValue({ data: null, error: new Error("base caída") });

    await expect(obtenerMateriales()).resolves.toEqual([]);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0]?.[1]).toMatchObject({
      tags: { "materiales-degradado": "true" },
    });
  });

  it("el fallo NO se cachea: cuando la base vuelve, la siguiente llamada ya trae datos", async () => {
    limiteMock.mockResolvedValueOnce({ data: null, error: new Error("base caída") });
    await obtenerMateriales();

    limiteMock.mockResolvedValue({ data: [fila({ id: "ok" })], error: null });
    const items = await obtenerMateriales();

    expect(items.map((i) => i.id)).toEqual(["ok"]);
    expect(limiteMock).toHaveBeenCalledTimes(2);
  });
});
