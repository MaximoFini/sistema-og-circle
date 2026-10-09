// Tests de la validación de cliente (las partes que no necesitan DOM).
// `recortarAFoto` usa canvas: lo cubre el e2e del editor.

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectarTipo, validarArchivoFoto, validarDimensiones } from "./cliente";
import { FOTO_ORIGINAL_MAX_BYTES } from "./constantes";

async function archivo(formato: "jpeg" | "png" | "webp" | "gif", tipo: string): Promise<File> {
  const buffer = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 9, g: 9, b: 9 } },
  })
    .toFormat(formato)
    .toBuffer();
  return new File([new Uint8Array(buffer)], `foto.${formato}`, { type: tipo });
}

describe("detectarTipo", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)("reconoce %s por su firma", async (formato, esperado) => {
    const f = await archivo(formato, esperado);
    expect(detectarTipo(new Uint8Array(await f.arrayBuffer()))).toBe(esperado);
  });

  it("no reconoce GIF ni texto", async () => {
    const gif = await archivo("gif", "image/gif");
    expect(detectarTipo(new Uint8Array(await gif.arrayBuffer()))).toBeNull();
    expect(detectarTipo(new TextEncoder().encode("hola mundo, no soy foto"))).toBeNull();
  });
});

describe("validarArchivoFoto", () => {
  it("acepta JPG, PNG y WebP reales", async () => {
    expect(await validarArchivoFoto(await archivo("jpeg", "image/jpeg"))).toBeNull();
    expect(await validarArchivoFoto(await archivo("png", "image/png"))).toBeNull();
    expect(await validarArchivoFoto(await archivo("webp", "image/webp"))).toBeNull();
  });

  it("rechaza un texto renombrado a .jpg", async () => {
    const falso = new File(["no soy una foto"], "foto.jpg", { type: "image/jpeg" });
    expect(await validarArchivoFoto(falso)).toMatch(/Formato no permitido/);
  });

  it("rechaza GIF aunque sea una imagen real", async () => {
    expect(await validarArchivoFoto(await archivo("gif", "image/gif"))).toMatch(
      /Formato no permitido/,
    );
  });

  it("rechaza archivos de más de 5 MB con el límite en el mensaje", async () => {
    const enorme = new File([new Uint8Array(FOTO_ORIGINAL_MAX_BYTES + 1)], "foto.jpg", {
      type: "image/jpeg",
    });
    expect(await validarArchivoFoto(enorme)).toMatch(/más de 5 MB/);
  });

  it("rechaza un archivo vacío", async () => {
    expect(await validarArchivoFoto(new File([], "f.jpg", { type: "image/jpeg" }))).toMatch(
      /vacío/,
    );
  });
});

describe("validarDimensiones", () => {
  it("exige al menos 256 px por lado", () => {
    expect(validarDimensiones(256, 256)).toBeNull();
    expect(validarDimensiones(255, 900)).toMatch(/al menos 256/);
    expect(validarDimensiones(900, 100)).toMatch(/al menos 256/);
  });
});
