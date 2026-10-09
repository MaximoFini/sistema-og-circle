import { describe, expect, it } from "vitest";
import type { MaterialItem } from "@/lib/materiales/tipos";
import { etiquetaTipo, metaMaterial, VISIBLES_COLAPSADO, vistaLista } from "./materialesVisibles";

const material = (n: number): MaterialItem => ({
  id: `m${n}`,
  titulo: `Material ${n}`,
  descripcion: null,
  tipo: "pdf",
  extension: "pdf",
  tamanoBytes: 1024,
});
const lista = (cantidad: number) => Array.from({ length: cantidad }, (_, i) => material(i + 1));

describe("vistaLista", () => {
  it("se colapsa en 6", () => {
    expect(VISIBLES_COLAPSADO).toBe(6);
  });

  it("sin materiales: nada que mostrar ni botón", () => {
    expect(vistaLista([], false)).toEqual({ visibles: [], botonExpandir: null });
  });

  it("con 6 o menos se ven todos y NO hay botón", () => {
    for (const n of [1, 5, 6]) {
      const v = vistaLista(lista(n), false);
      expect(v.visibles).toHaveLength(n);
      expect(v.botonExpandir).toBeNull();
    }
  });

  it("con 7 colapsado: los primeros 6, en orden, y 'Ver todos (7)'", () => {
    const v = vistaLista(lista(7), false);

    expect(v.visibles.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(v.botonExpandir).toBe("Ver todos (7)");
  });

  it("expandido: todos y 'Ver menos'", () => {
    const v = vistaLista(lista(20), true);

    expect(v.visibles).toHaveLength(20);
    expect(v.botonExpandir).toBe("Ver menos");
  });

  it("'expandido' con 6 o menos no muestra 'Ver menos'", () => {
    expect(vistaLista(lista(3), true).botonExpandir).toBeNull();
  });
});

describe("etiquetaTipo / metaMaterial", () => {
  it("nombres legibles por tipo", () => {
    expect(etiquetaTipo("pdf")).toBe("PDF");
    expect(etiquetaTipo("powerpoint")).toBe("PowerPoint");
    expect(etiquetaTipo("excel")).toBe("Excel");
    expect(etiquetaTipo("word")).toBe("Word");
  });

  it("'PDF · 2,3 MB'", () => {
    expect(metaMaterial({ tipo: "pdf", tamanoBytes: Math.round(2.3 * 1024 * 1024) })).toBe(
      "PDF · 2,3 MB",
    );
    expect(metaMaterial({ tipo: "word", tamanoBytes: 850 * 1024 })).toBe("Word · 850 KB");
  });
});
