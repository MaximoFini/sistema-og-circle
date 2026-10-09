// VGRP-88 — helpers de la subida del admin y del indicador de espacio, sin red ni DOM: el
// XMLHttpRequest es un doble que se maneja a mano (progreso, fin, error, cancelar).

import { describe, expect, it, vi } from "vitest";
import { MAX_BYTES } from "@/lib/materiales/tipos";
import { estadoEspacio } from "./espacio";
import { SubidaCancelada, subirConProgreso, tituloSugerido, validarArchivo } from "./subida";

describe("validarArchivo (antes de pedir nada al servidor)", () => {
  it("acepta los 4 tipos", () => {
    for (const nombre of [
      "a.pdf",
      "a.ppt",
      "a.pptx",
      "a.xls",
      "a.xlsx",
      "a.csv",
      "a.doc",
      "a.docx",
    ]) {
      expect(validarArchivo(nombre, 1000)).toBeNull();
    }
  });

  it("rechaza otros tipos con un mensaje que dice qué se puede subir", () => {
    expect(validarArchivo("instalador.exe", 1000)).toMatch(/PDF, PowerPoint, Excel o Word/);
    expect(validarArchivo("foto.png", 1000)).not.toBeNull();
  });

  it("rechaza 51 MB diciendo cuánto pesa y cuál es el máximo", () => {
    const error = validarArchivo("a.pdf", 51 * 1024 * 1024);
    expect(error).toContain("51 MB");
    expect(error).toContain("50 MB");
  });

  it("50 MB justos se aceptan", () => {
    expect(validarArchivo("a.pdf", MAX_BYTES)).toBeNull();
  });

  it("un archivo vacío no se sube", () => {
    expect(validarArchivo("a.pdf", 0)).toMatch(/vacío/);
  });
});

describe("tituloSugerido", () => {
  it("saca la extensión y los guiones bajos", () => {
    expect(tituloSugerido("Checklist_de_importacion.pdf")).toBe("Checklist de importacion");
    expect(tituloSugerido("Guía v2.final.pptx")).toBe("Guía v2.final");
    expect(tituloSugerido("sin-extension")).toBe("sin-extension");
  });
});

/** Doble de XMLHttpRequest: guarda lo que se envió y deja disparar los eventos a mano. */
function xhrFalso() {
  const xhr = {
    upload: {} as { onprogress?: (e: Partial<ProgressEvent>) => void },
    status: 0,
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(() => xhr.onabort?.()),
    onload: undefined as undefined | (() => void),
    onerror: undefined as undefined | (() => void),
    onabort: undefined as undefined | (() => void),
  };
  return xhr;
}

const SUBIDA = {
  path: "pendientes/x.csv",
  signedUrl: "https://storage/object/upload/sign/materiales/pendientes/x.csv?token=t",
  contentType: "text/csv",
};

describe("subirConProgreso", () => {
  it("hace PUT a la URL firmada con multipart y el Content-Type del servidor (no el del SO)", async () => {
    const xhr = xhrFalso();
    // Un .csv en Windows llega como application/vnd.ms-excel: tiene que viajar como text/csv.
    const archivo = new Blob(["a,b"], { type: "application/vnd.ms-excel" });

    const { promesa } = subirConProgreso(
      SUBIDA,
      archivo,
      () => {},
      () => xhr as never,
    );
    xhr.status = 200;
    xhr.onload?.();
    await promesa;

    expect(xhr.open).toHaveBeenCalledWith("PUT", SUBIDA.signedUrl);
    const cuerpo = xhr.send.mock.calls[0]?.[0] as FormData;
    expect(cuerpo.get("cacheControl")).toBe("3600");
    expect((cuerpo.get("") as Blob).type).toBe("text/csv");
  });

  it("informa el progreso real y termina en 100", async () => {
    const xhr = xhrFalso();
    const progreso: number[] = [];

    const { promesa } = subirConProgreso(
      SUBIDA,
      new Blob(["x"]),
      (p) => progreso.push(p),
      () => xhr as never,
    );
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 75, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 80, total: 0 }); // se ignora
    xhr.status = 200;
    xhr.onload?.();
    await promesa;

    expect(progreso).toEqual([25, 75, 100]);
  });

  it("Cancelar aborta y la promesa rechaza con SubidaCancelada", async () => {
    const xhr = xhrFalso();

    const subida = subirConProgreso(
      SUBIDA,
      new Blob(["x"]),
      () => {},
      () => xhr as never,
    );
    subida.cancelar();

    await expect(subida.promesa).rejects.toBeInstanceOf(SubidaCancelada);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
  });

  it("si se corta la conexión, rechaza con un mensaje claro", async () => {
    const xhr = xhrFalso();

    const { promesa } = subirConProgreso(
      SUBIDA,
      new Blob(["x"]),
      () => {},
      () => xhr as never,
    );
    xhr.onerror?.();

    await expect(promesa).rejects.toThrow(/Se cortó la conexión/);
  });

  it.each([
    [413, /supera el máximo/],
    [415, /tipo de archivo/],
    [403, /venció/],
    [500, /No se pudo subir/],
  ])("Storage responde %i -> mensaje para el admin", async (status, mensaje) => {
    const xhr = xhrFalso();

    const { promesa } = subirConProgreso(
      SUBIDA,
      new Blob(["x"]),
      () => {},
      () => xhr as never,
    );
    xhr.status = status;
    xhr.onload?.();

    await expect(promesa).rejects.toThrow(mensaje);
  });
});

describe("estadoEspacio", () => {
  const MB = 1024 * 1024;

  it("suma los tamaños y lo muestra sobre 1 GB", () => {
    expect(estadoEspacio([200 * MB, 112 * MB])).toEqual({
      texto: "Espacio usado: 312 MB de 1 GB",
      porcentaje: 30,
      advertencia: false,
    });
  });

  it("sin materiales: 0 B", () => {
    expect(estadoEspacio([]).texto).toBe("Espacio usado: 0 B de 1 GB");
  });

  it("desde el 80 % es advertencia", () => {
    expect(estadoEspacio([810 * MB]).advertencia).toBe(false); // 79 %
    expect(estadoEspacio([820 * MB]).advertencia).toBe(true); // 80 %
  });

  it("nunca pasa del 100 % aunque se pase del cupo", () => {
    expect(estadoEspacio([2000 * MB]).porcentaje).toBe(100);
  });

  it("tolera tamaños que llegan como texto (bigint de la base)", () => {
    expect(estadoEspacio(["1048576" as unknown as number]).texto).toBe(
      "Espacio usado: 1 MB de 1 GB",
    );
  });
});
