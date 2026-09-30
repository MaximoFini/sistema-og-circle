// Paridad de la estrategia de venta portada contra PriceStrategy.jsx ORIGINAL
// (vegroup@b550803).
//
// test/fixtures/cotizador/estrategia.json lo genera
// scripts/cotizador/generar-fixtures-estrategia.mjs evaluando el código del
// original tal cual (las tablas y funciones del módulo + el cuerpo del
// componente con sus useMemo), sobre una matriz de estados del formulario.
// Acá se corre el port con los mismos estados y se exige `toEqual` exacto:
// sin tolerancia, un solo float distinto rompe el test.
//
// El port pasa por el mismo JSON que el fixture (`aJSON`) para que la
// comparación sea simétrica: el generador ya verificó que no haya NaN ni
// Infinity (que JSON colapsaría a null), así que lo único que el ida y vuelta
// iguala es `undefined` ausente vs presente y -0 vs 0.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ARANCEL_ML,
  CANALES,
  CATEGORIAS_ML,
  DIAS_ML,
  ESTADO_INICIAL,
  type EstadoEstrategia,
  evaluarEstrategia,
  fijoML,
  IVA,
  MEDIOS,
  MIX_TIPICO,
  money,
  num,
  PASARELAS,
  pct,
} from "./estrategia";

interface Caso {
  id: string;
  cambios: Partial<EstadoEstrategia>;
  esperado: unknown;
}

interface FixtureEstrategia {
  origen: { repo: string; commit: string; archivo: string };
  constantes: Record<string, unknown>;
  estadoInicial: EstadoEstrategia;
  numeros: { s: string | number; v: number }[];
  fijos: { precio: number; categoria: string; v: number }[];
  formatos: { v: number | null; money: string; pct: string; pct0: string; pct2: string }[];
  casos: Caso[];
}

// Con fs y no con `import … from "….json"`: ~900 kB que tsc tipearía literal.
const fixture = JSON.parse(
  readFileSync(new URL("../../test/fixtures/cotizador/estrategia.json", import.meta.url), "utf8"),
) as FixtureEstrategia;

const aJSON = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe("estrategia de venta — paridad con PriceStrategy.jsx original", () => {
  it("el fixture es del commit registrado en ORIGEN.md", () => {
    expect(fixture.origen.commit).toBe("b550803");
    expect(fixture.origen.archivo).toBe("src/components/PriceStrategy.jsx");
  });

  it("mismas tablas de referencia 2026", () => {
    expect(
      aJSON({ IVA, CATEGORIAS_ML, MEDIOS, MIX_TIPICO, PASARELAS, ARANCEL_ML, DIAS_ML, CANALES }),
    ).toEqual(fixture.constantes);
    // El orden de CANALES define el orden de desempate del ranking.
    expect(Object.keys(CANALES)).toEqual(Object.keys(fixture.constantes.CANALES as object));
  });

  it("mismo estado inicial del formulario", () => {
    expect(ESTADO_INICIAL).toEqual(fixture.estadoInicial);
  });

  it("num() lee igual los números a la argentina", () => {
    for (const { s, v } of fixture.numeros) {
      const entrada = s === "NaN" ? Number.NaN : s;
      expect(num(entrada), JSON.stringify(s)).toBe(v);
    }
  });

  it("fijoML() da el mismo costo fijo por tramo", () => {
    for (const { precio, categoria, v } of fixture.fijos) {
      expect(fijoML(precio, categoria), `${categoria} @ ${precio}`).toBe(v);
    }
  });

  it("money() y pct() formatean igual", () => {
    for (const f of fixture.formatos) {
      expect(money(f.v)).toBe(f.money);
      expect(pct(f.v)).toBe(f.pct);
      expect(pct(f.v, 0)).toBe(f.pct0);
      expect(pct(f.v, 2)).toBe(f.pct2);
    }
  });

  it("la matriz cubre lo que tiene que cubrir", () => {
    expect(fixture.casos.length).toBeGreaterThan(100);
    const ids = new Set(
      fixture.casos.flatMap((c) => (c.esperado as { avisos: { id: string }[] }).avisos),
    );
    const tipos = new Set([...ids].map((a) => a.id));
    for (const t of ["gan", "tramo-sube", "tramo-baja", "rojos", "credito", "brecha", "plazo"]) {
      expect(tipos.has(t), `ningún caso dispara el aviso "${t}"`).toBe(true);
    }
    expect(fixture.casos.some((c) => JSON.stringify(c.esperado).includes('"oscila":true'))).toBe(
      true,
    );
  });

  describe.each(fixture.casos)("$id", ({ cambios, esperado }) => {
    it("ranking, canal elegido, lote y avisos idénticos", () => {
      const { canal: _canal, ...resultado } = evaluarEstrategia({
        ...fixture.estadoInicial,
        ...cambios,
      });
      expect(aJSON(resultado)).toEqual(esperado);
    });
  });
});
