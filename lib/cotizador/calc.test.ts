// Paridad del motor portado contra el calc.js ORIGINAL (vegroup@b550803).
//
// test/fixtures/cotizador/courier.json lo genera
// scripts/cotizador/generar-fixtures.mjs corriendo el original sobre una
// matriz de casos (3 regímenes × 3 rutas, TC, alícuotas, bordes). Acá se
// corre el port con las MISMAS entradas y se exige `toEqual` sin tolerancia:
// un solo float distinto (p. ej. por sumar en otro orden) rompe el test, y
// está bien que así sea.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  calcAllIntegral,
  calcAllRoutes,
  calcIntegral,
  calcRoute,
  fmtARS,
  fmtUSD,
  INTEGRAL_THRESHOLD,
  INTEGRAL_VOL_RATE,
  LABELS,
  PE_LIMITS,
  PEQUEÑOS_ENVIOS,
  ROUTES,
} from "./calc";
import type { ConfigCalculo, EntradaCalculo, Ruta } from "./types";

interface Caso {
  id: string;
  fn: "calcAllRoutes" | "calcAllIntegral" | "calcRoute" | "calcIntegral";
  args: unknown[];
  esperado: unknown;
}

interface FixtureCourier {
  origen: { repo: string; commit: string; archivo: string };
  constantes: unknown;
  formatos: { n: number | null; usd: string; ars: string }[];
  casos: Caso[];
}

// Se lee con fs y no con `import … from "….json"` a propósito: son ~500 kB y
// tsc infiere un tipo literal enorme para cada JSON importado (typecheck
// lento). Cada caso se interpreta según `fn`.
const courier = JSON.parse(
  readFileSync(new URL("../../test/fixtures/cotizador/courier.json", import.meta.url), "utf8"),
) as FixtureCourier;
const casos = courier.casos;

function ruta(id: unknown): Ruta {
  const r = ROUTES.find((x) => x.id === id);
  if (!r) throw new Error(`Ruta desconocida en el fixture: ${String(id)}`);
  return r;
}

function correr({ fn, args }: Caso): unknown {
  const inp = args[0] as EntradaCalculo;
  switch (fn) {
    case "calcAllRoutes":
      return args.length > 1 ? calcAllRoutes(inp, args[1] as ConfigCalculo) : calcAllRoutes(inp);
    case "calcAllIntegral":
      return calcAllIntegral(inp);
    case "calcRoute":
      return calcRoute(inp, ruta(args[1]));
    case "calcIntegral":
      return calcIntegral(inp, ruta(args[1]));
  }
}

describe("calc.ts — paridad con vegroup@b550803 src/lib/calc.js", () => {
  it("el fixture se generó con el commit de origen", () => {
    expect(courier.origen.commit).toBe("b550803");
  });

  it("cubre los tres regímenes y las tres rutas", () => {
    const prefijos = new Set(casos.map((c) => c.id.split("/")[0]));
    expect(prefijos).toEqual(
      new Set(["general", "pequeños", "integral", "calcRoute", "calcIntegral", "extra"]),
    );
    expect(ROUTES.map((r) => r.id)).toEqual(["miami", "barcelona", "china"]);
  });

  it("constantes idénticas al original", () => {
    expect({
      ROUTES,
      CONFIG,
      PEQUEÑOS_ENVIOS,
      PE_LIMITS,
      LABELS,
      INTEGRAL_THRESHOLD,
      INTEGRAL_VOL_RATE,
    }).toEqual(courier.constantes);
  });

  it.each(casos.map((c) => [c.id, c] as const))("%s", (_id, caso) => {
    expect(correr(caso)).toEqual(caso.esperado);
  });

  it.each(courier.formatos.map((f) => [String(f.n), f] as const))("fmtUSD/fmtARS(%s)", (_n, f) => {
    expect(fmtUSD(f.n)).toBe(f.usd);
    expect(fmtARS(f.n)).toBe(f.ars);
  });
});
