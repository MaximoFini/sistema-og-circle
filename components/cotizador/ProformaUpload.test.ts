// VGRP-57 US-4 — el límite de la proforma baja de 8 a 3 MB y se valida en el
// navegador, antes de leer o subir el archivo.

import { describe, expect, it } from "vitest";
import { ACCEPTED, MAX_MB, validarArchivo } from "./ProformaUpload";

const MB = 1024 * 1024;

describe("validarArchivo (ProformaUpload)", () => {
  it("el límite es 3 MB (no los 8 del original)", () => {
    expect(MAX_MB).toBe(3);
  });

  it("acepta los mismos tipos que el original", () => {
    expect([...ACCEPTED]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
    ]);
    for (const type of ACCEPTED) {
      expect(validarArchivo({ type, size: 1000 })).toBeNull();
    }
  });

  it("exactamente 3 MB pasa; un byte más se rechaza con el límite en el mensaje", () => {
    expect(validarArchivo({ type: "application/pdf", size: 3 * MB })).toBeNull();
    const error = validarArchivo({ type: "application/pdf", size: 3 * MB + 1 });
    expect(error).toMatch(/máximo es 3 MB/);
  });

  it("dice cuánto pesa el archivo rechazado", () => {
    expect(validarArchivo({ type: "image/png", size: 5.5 * MB })).toBe(
      "El archivo pesa 5,5 MB y el máximo es 3 MB. Subí uno más liviano.",
    );
  });

  it("un formato no soportado se rechaza antes de mirar el peso", () => {
    expect(validarArchivo({ type: "text/plain", size: 50 * MB })).toBe(
      "Formato no soportado. Subí una imagen (JPG, PNG, WebP o GIF) o un PDF.",
    );
  });
});
