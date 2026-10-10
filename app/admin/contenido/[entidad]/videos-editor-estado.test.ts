import { describe, expect, it } from "vitest";
import type { VideoEditor, VideosParaEditor } from "@/lib/data/admin/contenido";
import { aplicarGuardado, aplicarOrden, filaAVideoEditor } from "./videos-editor-estado";

function video(n: number, extra: Partial<VideoEditor> = {}): VideoEditor {
  return {
    id: `v${n}`,
    stage: 1,
    titulo: `Video ${n}`,
    descripcion: null,
    providerRef: null,
    publicado: true,
    orden: n,
    thumbnailUrl: null,
    ...extra,
  };
}

function estado(
  s1: { pub?: VideoEditor[]; desp?: VideoEditor[] } = {},
  s2: { pub?: VideoEditor[]; desp?: VideoEditor[] } = {},
): VideosParaEditor {
  return {
    1: { publicados: s1.pub ?? [], despublicados: s1.desp ?? [] },
    2: { publicados: s2.pub ?? [], despublicados: s2.desp ?? [] },
  };
}

const ids = (l: VideoEditor[]) => l.map((v) => v.id);

describe("filaAVideoEditor", () => {
  it("la miniatura sólo existe si está publicado y el link es válido", () => {
    const base = {
      id: "x",
      stage: 1,
      titulo: "T",
      descripcion: null,
      orden: 0,
    };
    expect(
      filaAVideoEditor({ ...base, provider_ref: "dQw4w9WgXcQ", publicado: true }).thumbnailUrl,
    ).toContain("dQw4w9WgXcQ");
    expect(
      filaAVideoEditor({ ...base, provider_ref: "dQw4w9WgXcQ", publicado: false }).thumbnailUrl,
    ).toBeNull();
    expect(
      filaAVideoEditor({ ...base, provider_ref: null, publicado: true }).thumbnailUrl,
    ).toBeNull();
  });
});

describe("aplicarGuardado", () => {
  it("un video nuevo y publicado entra al final de la grilla de su stage", () => {
    const antes = estado({ pub: [video(1), video(2)] });
    const despues = aplicarGuardado(antes, video(3));

    expect(ids(despues[1].publicados)).toEqual(["v1", "v2", "v3"]);
    expect(despues[1].despublicados).toEqual([]);
  });

  it("un video nuevo SIN publicar va a Despublicados, no a la grilla", () => {
    const despues = aplicarGuardado(estado(), video(1, { publicado: false }));

    expect(despues[1].publicados).toEqual([]);
    expect(ids(despues[1].despublicados)).toEqual(["v1"]);
  });

  it("editar un publicado lo reemplaza en su lugar, sin duplicarlo", () => {
    const antes = estado({ pub: [video(1), video(2), video(3)] });
    const despues = aplicarGuardado(antes, video(2, { titulo: "Editado" }));

    expect(ids(despues[1].publicados)).toEqual(["v1", "v2", "v3"]);
    expect(despues[1].publicados[1]?.titulo).toBe("Editado");
  });

  it("despublicar saca el video de la grilla y los siguientes suben de lugar", () => {
    const antes = estado({ pub: [video(1), video(2), video(3)] });
    const despues = aplicarGuardado(antes, video(2, { publicado: false }));

    expect(ids(despues[1].publicados)).toEqual(["v1", "v3"]);
    expect(ids(despues[1].despublicados)).toEqual(["v2"]);
  });

  it("volver a publicar lo pasa de Despublicados al final de la grilla (orden al final)", () => {
    const antes = estado({ pub: [video(1), video(2)], desp: [video(3, { publicado: false })] });
    const despues = aplicarGuardado(antes, video(3, { orden: 10 }));

    expect(ids(despues[1].publicados)).toEqual(["v1", "v2", "v3"]);
    expect(despues[1].despublicados).toEqual([]);
  });

  it("no toca el otro stage", () => {
    const antes = estado({ pub: [video(1)] }, { pub: [video(2, { stage: 2 })] });
    const despues = aplicarGuardado(antes, video(3));

    expect(despues[2]).toEqual(antes[2]);
  });

  it("ignora un video del Stage 3 (fuera de este editor)", () => {
    const antes = estado();
    expect(aplicarGuardado(antes, video(1, { stage: 3 }))).toBe(antes);
  });
});

describe("aplicarOrden", () => {
  it("reordena los publicados del stage según los ids y reparte los mismos lugares", () => {
    const antes = estado({ pub: [video(5), video(7), video(9)] });
    const despues = aplicarOrden(antes, 1, ["v9", "v5", "v7"]);

    expect(ids(despues[1].publicados)).toEqual(["v9", "v5", "v7"]);
    expect(despues[1].publicados.map((v) => v.orden)).toEqual([5, 7, 9]);
  });

  it("no pierde un video que no vino en los ids (queda al final)", () => {
    const antes = estado({ pub: [video(1), video(2), video(3)] });
    const despues = aplicarOrden(antes, 1, ["v3", "v1"]);

    expect(ids(despues[1].publicados)).toEqual(["v3", "v1", "v2"]);
  });

  it("no toca los despublicados ni el otro stage", () => {
    const antes = estado(
      { pub: [video(1), video(2)], desp: [video(3, { publicado: false })] },
      { pub: [video(4, { stage: 2 })] },
    );
    const despues = aplicarOrden(antes, 1, ["v2", "v1"]);

    expect(despues[1].despublicados).toEqual(antes[1].despublicados);
    expect(despues[2]).toEqual(antes[2]);
  });
});
