import { describe, expect, it } from "vitest";
import { aResumenes, estadoTarjetaStage, hrefContinuar, type VideoResumen } from "./resumenStage";

describe("aResumenes", () => {
  it("deja solo id, título y miniatura: el embedUrl no viaja al cliente de Inicio", () => {
    const conEmbed = [
      {
        id: "a",
        titulo: "A",
        thumbnailUrl: "https://img/a.jpg",
        embedUrl: "https://secreto/embed/a",
        descripcion: "x",
      },
    ];

    const [resumen] = aResumenes(conEmbed);

    expect(resumen).toEqual({ id: "a", titulo: "A", thumbnailUrl: "https://img/a.jpg" });
    expect(JSON.stringify(resumen)).not.toContain("secreto");
  });
});

const video = (n: number): VideoResumen => ({
  id: `v${n}`,
  titulo: `Video ${n}`,
  thumbnailUrl: null,
});
const VIDEOS = [1, 2, 3, 4, 5].map(video);

describe("estadoTarjetaStage", () => {
  it("sin videos publicados es 'proximamente', aunque todavía esté cargando", () => {
    expect(estadoTarjetaStage([], new Set(), false)).toEqual({ tipo: "proximamente" });
    expect(estadoTarjetaStage([], new Set(), true)).toEqual({ tipo: "proximamente" });
  });

  it("mientras no se sabe qué vio el usuario, es 'cargando'", () => {
    expect(estadoTarjetaStage(VIDEOS, new Set(), true)).toEqual({ tipo: "cargando" });
  });

  it("sin nada visto propone el primero", () => {
    const e = estadoTarjetaStage(VIDEOS, new Set(), false);

    expect(e).toMatchObject({ tipo: "en-curso", vistos: 0, total: 5 });
    expect(e.tipo === "en-curso" && e.proximo.id).toBe("v1");
  });

  it("propone el PRIMERO no visto, no el siguiente al último visto (vio 1, 2 y 5 → el 3)", () => {
    const e = estadoTarjetaStage(VIDEOS, new Set(["v1", "v2", "v5"]), false);

    expect(e).toMatchObject({ tipo: "en-curso", vistos: 3, total: 5 });
    expect(e.tipo === "en-curso" && e.proximo.id).toBe("v3");
  });

  it("completado cuando vio todos los publicados", () => {
    const todos = new Set(VIDEOS.map((v) => v.id));

    expect(estadoTarjetaStage(VIDEOS, todos, false)).toEqual({
      tipo: "completado",
      vistos: 5,
      total: 5,
    });
  });

  it("no cuenta ids vistos que ya no están publicados (ni los de otro stage)", () => {
    const vistos = new Set(["v1", "v2", "viejo-despublicado", "de-otro-stage"]);
    const e = estadoTarjetaStage(VIDEOS, vistos, false);

    expect(e).toMatchObject({ tipo: "en-curso", vistos: 2, total: 5 });
  });

  it("con un solo video visto está completado", () => {
    expect(estadoTarjetaStage([video(1)], new Set(["v1"]), false)).toMatchObject({
      tipo: "completado",
      vistos: 1,
      total: 1,
    });
  });
});

describe("hrefContinuar", () => {
  it("lleva a /formacion con el video en la URL", () => {
    expect(hrefContinuar("abc-123")).toBe("/formacion?video=abc-123");
  });

  it("escapa lo que no es seguro en una query", () => {
    expect(hrefContinuar("a b&c=d")).toBe("/formacion?video=a%20b%26c%3Dd");
  });
});
