// Paridad de la búsqueda NCM portada contra el ncmSearch.js + data/ncm.js
// ORIGINALES (vegroup@b550803).
//
// test/fixtures/cotizador/ncm-busquedas.json lo genera
// scripts/cotizador/generar-fixtures.mjs corriendo el original. Acá se carga
// la MISMA base (public/cotizador/ncm-2026-1.json, copia byte a byte del
// ncm.json original) con cargarBaseDesdeDatos() — en Node no hay URL relativa
// para el fetch de loadBase() — y se exige mismos SIM, mismo orden y mismo
// score.

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { BaseNcmCruda, CandidatoSim, RegistroSim } from "../types";
import { cargarBaseDesdeDatos, getNcm, licLabel, loadBase } from "./base";
import { searchByPartidas, searchNCM } from "./search";

interface FixtureNcm {
  origen: { commit: string };
  base: { posiciones: number; sims: number };
  busquedas: { query: string; maxSim: number | null; resultado: [string, number][] }[];
  porPartidas: { partidas: unknown[]; maxSim: number | null; resultado: [string, number][] }[];
  registros: { codigo: string; registro: RegistroSim | null }[];
  etiquetasLic: { codigo: string; etiqueta: string }[];
}

const leer = (relativo: string) => readFileSync(new URL(relativo, import.meta.url), "utf8");

const fixture = JSON.parse(
  leer("../../../test/fixtures/cotizador/ncm-busquedas.json"),
) as FixtureNcm;

const simYScore = (res: CandidatoSim[]) => res.map((r) => [r.sim, r.score]);

beforeAll(() => {
  cargarBaseDesdeDatos(
    JSON.parse(leer("../../../public/cotizador/ncm-2026-1.json")) as BaseNcmCruda,
  );
});

describe("ncm — paridad con vegroup@b550803 (ncmSearch.js / data/ncm.js)", () => {
  it("el fixture se generó con el commit de origen", () => {
    expect(fixture.origen.commit).toBe("b550803");
  });

  it("la base cargada tiene las mismas posiciones y SIM", async () => {
    // Con la base ya inyectada, loadBase() no hace fetch: devuelve la memo.
    const headings = await loadBase();
    expect(headings.length).toBe(fixture.base.posiciones);
    expect(headings.reduce((n, h) => n + h.suf.length, 0)).toBe(fixture.base.sims);
  });

  it("hay al menos 20 consultas y una sin resultados", () => {
    expect(fixture.busquedas.length).toBeGreaterThanOrEqual(20);
    expect(fixture.busquedas.some((b) => b.resultado.length === 0)).toBe(true);
  });

  it.each(
    fixture.busquedas.map((b) => [JSON.stringify(b.query), b.maxSim ?? "default", b] as const),
  )("searchNCM(%s, %s)", async (_q, _m, b) => {
    const res = b.maxSim == null ? await searchNCM(b.query) : await searchNCM(b.query, b.maxSim);
    expect(simYScore(res)).toEqual(b.resultado);
  });

  it.each(
    fixture.porPartidas.map((p) => [JSON.stringify(p.partidas), p.maxSim ?? "default", p] as const),
  )("searchByPartidas(%s, %s)", async (_p, _m, p) => {
    const res =
      p.maxSim == null
        ? await searchByPartidas(p.partidas)
        : await searchByPartidas(p.partidas, p.maxSim);
    expect(simYScore(res)).toEqual(p.resultado);
  });

  it.each(fixture.registros.map((r) => [JSON.stringify(r.codigo), r] as const))(
    "getNcm(%s) devuelve el mismo registro",
    (_c, r) => {
      expect(getNcm(r.codigo)).toEqual(r.registro);
    },
  );

  it.each(fixture.etiquetasLic.map((l) => [JSON.stringify(l.codigo), l] as const))(
    "licLabel(%s)",
    (_c, l) => {
      expect(licLabel(l.codigo)).toBe(l.etiqueta);
    },
  );

  it("los candidatos llevan el registro completo, no sólo sim/score", async () => {
    const [primero] = await searchNCM("auriculares bluetooth", 40);
    const { score, ...registro } = primero;
    expect(score).toBeGreaterThan(0);
    expect(registro).toEqual(getNcm(primero.sim));
  });
});
