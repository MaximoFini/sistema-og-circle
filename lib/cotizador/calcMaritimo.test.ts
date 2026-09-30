// Paridad del motor marítimo portado contra calcMaritimo.js/tarifasMaritimo.js
// ORIGINALES (vegroup@b550803).
//
// test/fixtures/cotizador/maritimo.json lo genera
// scripts/cotizador/generar-fixtures-maritimo.mjs corriendo el original.
// Acá se corre el port con las MISMAS entradas y se exige `toEqual` sin
// tolerancia: un solo float distinto rompe el test, y está bien que así sea.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcAmbas, calcMaritimo, contenedorSugerido, medidas } from "./calcMaritimo";
import { ARANCEL_SIM, FLETE, IVA_FIJOS, SUMA_FIJOS, sugerirPuerto } from "./tarifasMaritimo";

interface Caso {
  id: string;
  fn: "medidas" | "calcMaritimo" | "calcAmbas" | "contenedorSugerido" | "sugerirPuerto";
  args: unknown[];
  esperado: unknown;
}

interface FixtureMaritimo {
  origen: { repo: string; commit: string; archivos: string[] };
  constantes: { SUMA_FIJOS: number; IVA_FIJOS: number; ARANCEL_SIM: number; FLETE: unknown };
  casos: Caso[];
}

// Se lee con fs y no con `import … from "….json"` a propósito: mismo motivo
// que calc.test.ts (typecheck lento con tipos literales enormes).
const maritimo = JSON.parse(
  readFileSync(new URL("../../test/fixtures/cotizador/maritimo.json", import.meta.url), "utf8"),
) as FixtureMaritimo;

function correr({ fn, args }: Caso): unknown {
  switch (fn) {
    case "medidas":
      return medidas(args[0] as Parameters<typeof medidas>[0]);
    case "calcMaritimo":
      return calcMaritimo(args[0] as Parameters<typeof calcMaritimo>[0]);
    case "calcAmbas":
      return calcAmbas(args[0] as Parameters<typeof calcAmbas>[0]);
    case "contenedorSugerido":
      return contenedorSugerido(args[0] as Parameters<typeof contenedorSugerido>[0]);
    case "sugerirPuerto":
      return sugerirPuerto(args[0]);
    default:
      throw new Error(`fn desconocida: ${fn satisfies never}`);
  }
}

describe("constantes (paridad con tarifasMaritimo.js original)", () => {
  it("bloque fijo", () => {
    expect(SUMA_FIJOS).toBe(maritimo.constantes.SUMA_FIJOS);
    expect(SUMA_FIJOS).toBe(1930);
    expect(IVA_FIJOS).toBe(maritimo.constantes.IVA_FIJOS);
    expect(IVA_FIJOS).toBeCloseTo(405.3, 10);
    expect(ARANCEL_SIM).toBe(maritimo.constantes.ARANCEL_SIM);
  });

  it("FLETE", () => {
    expect(FLETE).toEqual(maritimo.constantes.FLETE);
  });
});

describe("paridad exacta contra el fixture (calcMaritimo.js/tarifasMaritimo.js original)", () => {
  for (const caso of maritimo.casos) {
    it(`${caso.id} (${caso.fn})`, () => {
      const real = correr(caso);
      expect(real).toEqual(caso.esperado);
    });
  }
});

describe("invariantes del caso 'set de herramientas'", () => {
  const r = calcMaritimo({
    volumenM3: 8.501,
    pesoKg: 5500,
    fob: 18000,
    unidades: 1,
    die: 18,
    te: 3,
    iva: 21,
    tc: 1512,
  });

  it("FOB + gravámenes + gastos = a pagar", () => {
    expect(18000 + r.despacho.totalGravamenes + r.operativos.total).toBeCloseTo(
      r.totales.aPagar,
      8,
    );
  });

  it("costo real < total a pagar", () => {
    expect(r.totales.costos).toBeLessThan(r.totales.aPagar);
  });

  it("declarado < pagado", () => {
    expect(r.fleteDeclarado).toBeLessThan(r.fletePagado);
  });

  it("CIF < FOB + flete pagado + seguro", () => {
    expect(r.despacho.cif).toBeLessThan(18000 + r.fletePagado + r.seguro);
  });
});

describe("FOB 0 no rompe", () => {
  const cero = calcMaritimo({
    volumenM3: 1,
    pesoKg: 0,
    fob: 0,
    unidades: 1,
    die: 0,
    te: 0,
    iva: 21,
    tc: 1512,
  });

  it("costos finito", () => {
    expect(Number.isFinite(cero.totales.costos)).toBe(true);
  });

  it("flete pagado de 1 m³", () => {
    expect(cero.fletePagado).toBe(550);
  });

  it("declarado 70%", () => {
    expect(cero.fleteDeclarado).toBe(385);
  });
});

describe("las dos cotizaciones (calcAmbas)", () => {
  const base = {
    volumenM3: 8.501,
    pesoKg: 5500,
    fob: 18000,
    unidades: 1,
    die: 18,
    te: 3,
    iva: 21,
    tc: 1512,
  };

  it("sin tarifa de contenedor, full es estimado y da igual que el consolidado", () => {
    const ambas = calcAmbas(base);
    expect(ambas.fullEsEstimado).toBe(true);
    expect(ambas.full.totales.costos).toBe(ambas.consolidado.totales.costos);
    expect(ambas.contenedor.label).toBe("20' Dry");
  });

  it("con tarifa cargada, ya no es estimado y el flete arrastra derechos", () => {
    const ambas = calcAmbas(base);
    const conTarifa = calcAmbas({ ...base, fleteFullUsd: 4200 });
    expect(conTarifa.fullEsEstimado).toBe(false);
    expect(conTarifa.full.flete).toBe(4200);
    expect(conTarifa.full.totales.costos).toBeGreaterThan(conTarifa.consolidado.totales.costos);

    const deltaFlete = 4200 - ambas.consolidado.flete;
    const deltaCosto = conTarifa.full.totales.costos - conTarifa.consolidado.totales.costos;
    expect(deltaCosto).toBeGreaterThan(deltaFlete);
  });
});
