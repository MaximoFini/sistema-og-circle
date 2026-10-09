// Tests unitarios de procesarFoto(): las imágenes se generan con sharp en
// memoria, sin fixtures binarios en el repo.

import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FOTO_SALIDA_PX, FOTO_SUBIDA_MAX_BYTES } from "./constantes";
import { FotoInvalida, procesarFoto } from "./procesar";

function imagen(
  formato: "jpeg" | "png" | "webp" | "gif",
  ancho = 600,
  alto = 600,
): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .toFormat(formato)
    .toBuffer();
}

describe("procesarFoto", () => {
  it.each(["jpeg", "png", "webp"] as const)("acepta %s y devuelve WebP 512×512", async (f) => {
    const salida = await procesarFoto(await imagen(f));
    const meta = await sharp(salida).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(FOTO_SALIDA_PX);
    expect(meta.height).toBe(FOTO_SALIDA_PX);
  });

  it("recorta a cuadrado una imagen apaisada", async () => {
    const salida = await procesarFoto(await imagen("png", 1200, 400));
    const meta = await sharp(salida).metadata();
    expect(meta.width).toBe(FOTO_SALIDA_PX);
    expect(meta.height).toBe(FOTO_SALIDA_PX);
  });

  it("rechaza un archivo que no es imagen aunque se llame .jpg", async () => {
    await expect(procesarFoto(Buffer.from("no soy una foto, soy texto"))).rejects.toThrow(
      FotoInvalida,
    );
  });

  it("rechaza formatos de imagen no permitidos (GIF)", async () => {
    await expect(procesarFoto(await imagen("gif"))).rejects.toThrow(/Formato no permitido/);
  });

  it("rechaza SVG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600"/></svg>',
    );
    await expect(procesarFoto(svg)).rejects.toThrow(/Formato no permitido/);
  });

  it("rechaza imágenes de menos de 256 px", async () => {
    await expect(procesarFoto(await imagen("png", 100, 100))).rejects.toThrow(/al menos 256/);
    await expect(procesarFoto(await imagen("png", 800, 200))).rejects.toThrow(/al menos 256/);
  });

  it("rechaza un archivo vacío", async () => {
    await expect(procesarFoto(Buffer.alloc(0))).rejects.toThrow(FotoInvalida);
  });

  it("rechaza archivos por encima del tope de subida", async () => {
    await expect(procesarFoto(Buffer.alloc(FOTO_SUBIDA_MAX_BYTES + 1))).rejects.toThrow(
      /demasiado pesada/,
    );
  });

  it("no copia EXIF a la salida", async () => {
    const conExif = await sharp(await imagen("jpeg"))
      .withExif({ IFD0: { Make: "CamaraSecreta", Copyright: "dato privado" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(conExif).metadata()).exif).toBeDefined();

    const meta = await sharp(await procesarFoto(conExif)).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("aplica la orientación EXIF antes de validar y recortar", async () => {
    // 600×300 en bytes, pero con orientación 6 (girada 90°): visualmente 300×600.
    const rotada = await sharp(await imagen("jpeg", 600, 300))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const salida = await procesarFoto(rotada);
    const meta = await sharp(salida).metadata();
    expect(meta.width).toBe(FOTO_SALIDA_PX);
    expect(meta.orientation).toBeUndefined();
  });
});
