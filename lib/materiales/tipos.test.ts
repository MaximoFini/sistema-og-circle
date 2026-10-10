import { describe, expect, it } from "vitest";
import {
  EXTENSIONES,
  extensionDe,
  formatearTamano,
  LIMITE_STORAGE_BYTES,
  MAX_BYTES,
  nombreDescarga,
  PATH_PENDIENTE_REGEX,
} from "./tipos";

describe("PATH_PENDIENTE_REGEX", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";

  it("acepta pendientes/<uuid>.<ext> con las extensiones permitidas", () => {
    for (const ext of Object.keys(EXTENSIONES)) {
      expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.${ext}`)).toBe(true);
    }
  });

  it("rechaza otros prefijos, que es lo que impide apuntar a un archivo ya guardado", () => {
    expect(PATH_PENDIENTE_REGEX.test(`archivos/${uuid}.pdf`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`${uuid}.pdf`)).toBe(false);
  });

  it("rechaza traversal, subcarpetas y extensiones fuera de la lista", () => {
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/../archivos/${uuid}.pdf`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/x/${uuid}.pdf`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.exe`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.pdf.exe`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.PDF`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test("pendientes/no-es-uuid.pdf")).toBe(false);
  });

  it("está anclada: no acepta basura antes ni después", () => {
    expect(PATH_PENDIENTE_REGEX.test(`x pendientes/${uuid}.pdf`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.pdf\n`)).toBe(false);
    expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.pdf/otro`)).toBe(false);
  });

  it("cubre exactamente las extensiones de EXTENSIONES (no se desalinean)", () => {
    // Si alguien agrega una extensión a EXTENSIONES y se olvida de la regex, el alta de ese
    // tipo de archivo fallaría recién en producción.
    for (const ext of Object.keys(EXTENSIONES)) {
      expect(PATH_PENDIENTE_REGEX.test(`pendientes/${uuid}.${ext}`)).toBe(true);
    }
    expect(PATH_PENDIENTE_REGEX.source).toContain("pdf|pptx?|xlsx?|csv|docx?");
  });
});

describe("extensionDe", () => {
  it.each([
    ["guia.pdf", "pdf"],
    ["clase.pptx", "pptx"],
    ["clase.ppt", "ppt"],
    ["costos.xlsx", "xlsx"],
    ["costos.xls", "xls"],
    ["proveedores.csv", "csv"],
    ["contrato.docx", "docx"],
    ["contrato.doc", "doc"],
  ])("%s → %s", (nombre, esperada) => {
    expect(extensionDe(nombre)).toBe(esperada);
  });

  it("ignora mayúsculas", () => {
    expect(extensionDe("GUIA.PDF")).toBe("pdf");
    expect(extensionDe("Clase.PptX")).toBe("pptx");
  });

  it("toma la última extensión cuando hay varias", () => {
    expect(extensionDe("backup.tar.pdf")).toBe("pdf");
    expect(extensionDe("informe.pdf.exe")).toBeNull();
  });

  it("rechaza extensiones fuera de la lista", () => {
    for (const nombre of ["virus.exe", "foto.png", "notas.txt", "a.zip", "x.html", "x.svg"]) {
      expect(extensionDe(nombre)).toBeNull();
    }
  });

  it("rechaza lo que no tiene extensión", () => {
    expect(extensionDe("pdf")).toBeNull();
    expect(extensionDe("sin-extension")).toBeNull();
    expect(extensionDe("termina-en-punto.")).toBeNull();
    expect(extensionDe("")).toBeNull();
  });

  it("rechaza un archivo oculto sin nombre (`.pdf`)", () => {
    expect(extensionDe(".pdf")).toBeNull();
  });

  it("no confunde propiedades del prototipo con extensiones", () => {
    expect(extensionDe("a.constructor")).toBeNull();
    expect(extensionDe("a.toString")).toBeNull();
    expect(extensionDe("a.__proto__")).toBeNull();
  });
});

describe("EXTENSIONES", () => {
  it("cada extensión mapea a uno de los 4 tipos", () => {
    const tipos = new Set(Object.values(EXTENSIONES).map((e) => e.tipo));
    expect([...tipos].sort()).toEqual(["excel", "pdf", "powerpoint", "word"]);
  });

  it("los MIME son los del bucket (sin duplicados accidentales por extensión)", () => {
    const mimes = Object.values(EXTENSIONES).map((e) => e.mime);
    expect(new Set(mimes).size).toBe(mimes.length);
  });
});

describe("nombreDescarga", () => {
  it("usa el título más la extensión", () => {
    expect(nombreDescarga("Checklist de importación", "pdf")).toBe("Checklist de importación.pdf");
  });

  it("conserva tildes, ñ y signos válidos", () => {
    expect(nombreDescarga("Guía de compra: año 2026 (v2)", "pptx")).toBe(
      "Guía de compra año 2026 (v2).pptx",
    );
  });

  it("saca los caracteres inválidos para un nombre de archivo", () => {
    expect(nombreDescarga('a/b\\c:d*e?f"g<h>i|j', "pdf")).toBe("a b c d e f g h i j.pdf");
  });

  it("saca los caracteres de control", () => {
    expect(nombreDescarga("uno\u0000dos\ntres\u007fcuatro", "pdf")).toBe("uno dos tres cuatro.pdf");
  });

  it("colapsa espacios y recorta los bordes", () => {
    expect(nombreDescarga("   mucho    espacio   ", "docx")).toBe("mucho espacio.docx");
  });

  it("pasa la extensión a minúsculas", () => {
    expect(nombreDescarga("Planilla", "XLSX")).toBe("Planilla.xlsx");
  });

  it("recorta el título a 120 caracteres", () => {
    const nombre = nombreDescarga("a".repeat(300), "pdf");
    expect(nombre).toBe(`${"a".repeat(120)}.pdf`);
  });

  it("no deja puntos sueltos en los bordes (nada de `..pdf` ni de nombres ocultos)", () => {
    expect(nombreDescarga("...secreto...", "pdf")).toBe("secreto.pdf");
    expect(nombreDescarga(".env", "pdf")).toBe("env.pdf");
  });

  it("usa 'material' si el título queda vacío", () => {
    expect(nombreDescarga("", "pdf")).toBe("material.pdf");
    expect(nombreDescarga('/\\:*?"<>|', "pdf")).toBe("material.pdf");
    expect(nombreDescarga("   ", "pdf")).toBe("material.pdf");
  });
});

describe("formatearTamano", () => {
  it("bytes", () => {
    expect(formatearTamano(1)).toBe("1 B");
    expect(formatearTamano(1023)).toBe("1023 B");
  });

  it("KB, sin decimales cuando son redondos", () => {
    expect(formatearTamano(1024)).toBe("1 KB");
    expect(formatearTamano(850 * 1024)).toBe("850 KB");
  });

  it("MB con coma decimal (es-AR)", () => {
    expect(formatearTamano(Math.round(2.3 * 1024 * 1024))).toBe("2,3 MB");
    expect(formatearTamano(1024 * 1024)).toBe("1 MB");
  });

  it("el tope de subida se lee como 50 MB", () => {
    expect(formatearTamano(MAX_BYTES)).toBe("50 MB");
  });

  it("GB", () => {
    expect(formatearTamano(LIMITE_STORAGE_BYTES)).toBe("1 GB");
  });
});

describe("límites", () => {
  it("MAX_BYTES coincide con el file_size_limit del bucket y el check de la tabla", () => {
    expect(MAX_BYTES).toBe(52428800);
  });

  it("un archivo no puede ser más grande que el proyecto entero", () => {
    expect(MAX_BYTES).toBeLessThan(LIMITE_STORAGE_BYTES);
  });
});
