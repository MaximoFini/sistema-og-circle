// VGRP-88 — parte pura de lib/data/videos.ts, sin base: armarGrilla (sin tope y sin
// tiles de relleno), la forma de la consulta de obtenerVideosPorStage, idsDeFormacion y
// sinEmbed. Los contratos contra Supabase real están en videos.test.ts.

import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const { armarGrilla, idsDeFormacion, obtenerVideosPorStage, sinEmbed } = await import("./videos");

const REF = "dQw4w9WgXcQ";

function fila(n: number, extra: Record<string, unknown> = {}) {
  return {
    id: `v${n}`,
    titulo: `Video ${n}`,
    descripcion: null,
    provider_ref: REF,
    publicado: true,
    ...extra,
  };
}

describe("armarGrilla", () => {
  it("sin filas devuelve [] (no hay tiles de relleno)", () => {
    expect(armarGrilla([])).toEqual([]);
  });

  it("no pone tope: 15 videos de Stage 2 salen los 15, en el orden recibido", () => {
    const filas = Array.from({ length: 15 }, (_, i) => fila(i + 1));
    const items = armarGrilla(filas);

    expect(items).toHaveLength(15);
    expect(items.map((i) => i.id)).toEqual(filas.map((f) => f.id));
  });

  it("tampoco recorta por encima de lo que antes eran los topes (8 y 3)", () => {
    expect(armarGrilla(Array.from({ length: 40 }, (_, i) => fila(i)))).toHaveLength(40);
  });

  it("todo ítem trae embed y miniatura", () => {
    const [item] = armarGrilla([fila(1)]);

    expect(item?.embedUrl).toContain(REF);
    expect(item?.thumbnailUrl).toContain(REF);
  });

  it("descarta los no publicados aunque tengan provider_ref, sin filtrar el ref", () => {
    const items = armarGrilla([
      fila(1),
      fila(2, { publicado: false, provider_ref: "SECRETO0000" }),
    ]);

    expect(items.map((i) => i.id)).toEqual(["v1"]);
    expect(JSON.stringify(items)).not.toContain("SECRETO0000");
  });

  it("descarta los publicados sin provider_ref o con un ref inválido (embed roto)", () => {
    const items = armarGrilla([
      fila(1),
      fila(2, { provider_ref: null }),
      fila(3, { provider_ref: "" }),
      fila(4, { provider_ref: "https://youtu.be/???si=abc" }),
      fila(5),
    ]);

    expect(items.map((i) => i.id)).toEqual(["v1", "v5"]);
  });
});

describe("obtenerVideosPorStage — forma de la consulta", () => {
  it("filtra publicados con ref, ordena por orden y pone un límite explícito", async () => {
    const llamadas: [string, unknown[]][] = [];
    const cadena: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "not", "order"]) {
      cadena[metodo] = (...args: unknown[]) => {
        llamadas.push([metodo, args]);
        return cadena;
      };
    }
    cadena.limit = (...args: unknown[]) => {
      llamadas.push(["limit", args]);
      return Promise.resolve({ data: [fila(1)], error: null });
    };
    const admin = { from: () => cadena } as unknown as Parameters<typeof obtenerVideosPorStage>[0];

    const items = await obtenerVideosPorStage(admin, 2);

    expect(items.map((i) => i.id)).toEqual(["v1"]);
    expect(llamadas).toContainEqual(["eq", ["stage", 2]]);
    expect(llamadas).toContainEqual(["eq", ["publicado", true]]);
    expect(llamadas).toContainEqual(["not", ["provider_ref", "is", null]]);
    expect(llamadas).toContainEqual(["order", ["orden", { ascending: true }]]);
    // RENDIMIENTO regla 7: todo listado lleva .limit() explícito.
    expect(llamadas.find(([m]) => m === "limit")?.[1]).toEqual([200]);
  });
});

describe("idsDeFormacion", () => {
  it("junta los ids de Stage 1 y Stage 2 en ese orden", () => {
    expect(idsDeFormacion(armarGrilla([fila(1), fila(2)]), armarGrilla([fila(3)]))).toEqual([
      "v1",
      "v2",
      "v3",
    ]);
  });

  it("sin videos da []", () => {
    expect(idsDeFormacion([], [])).toEqual([]);
  });
});

describe("sinEmbed", () => {
  it("saca el embed y conserva el resto (títulos y miniaturas viajan, US-6)", () => {
    const [item] = sinEmbed(armarGrilla([fila(1)]));

    expect(item?.embedUrl).toBeNull();
    expect(item?.thumbnailUrl).not.toBeNull();
    expect(item?.titulo).toBe("Video 1");
  });
});
