// VGRP-70 — achica una foto en el navegador antes de subirla a
// identificar-producto. Las fotos de celular pesan 3-8 MB; el endpoint acepta
// 3 MB decodificados (en base64 viajan ~4 MB, y Vercel corta los pedidos de
// más de 4,5 MB). Para identificar el producto alcanza con 1600 px de lado.
//
// Siempre devuelve JPEG: re-codificar también resuelve formatos que la IA no
// acepta (HEIC del iPhone, por ejemplo) si el navegador los sabe abrir.
//
// Client-only (canvas). La cuenta de dimensiones es pura y tiene test.

export const LADO_MAXIMO = 1600;
export const MAX_BYTES_SUBIDA = 3 * 1024 * 1024;

/** Ancho y alto con el lado mayor en `max` como mucho. Nunca agranda. */
export function dimensionesAchicadas(
  ancho: number,
  alto: number,
  max: number = LADO_MAXIMO,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= max) return { ancho, alto };
  const escala = max / mayor;
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

async function aJpeg(imagen: ImageBitmap, max: number, calidad: number): Promise<Blob> {
  const { ancho, alto } = dimensionesAchicadas(imagen.width, imagen.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede procesar la foto.");
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
  if (!blob) throw new Error("No se pudo procesar la foto. Probá con otra.");
  return blob;
}

/** La foto como JPEG liviano, lista para `fileToBase64()`. */
export async function achicarImagen(archivo: Blob): Promise<Blob> {
  let imagen: ImageBitmap;
  try {
    // `from-image`: respeta la rotación EXIF (si no, las fotos verticales del
    // celular salen acostadas).
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No pudimos abrir esa imagen. Probá con una foto JPG o PNG.");
  }
  try {
    const blob = await aJpeg(imagen, LADO_MAXIMO, 0.85);
    if (blob.size <= MAX_BYTES_SUBIDA) return blob;
    // Muy raro a 1600 px, pero si pasa, un segundo intento más chico.
    const chico = await aJpeg(imagen, 1200, 0.75);
    if (chico.size <= MAX_BYTES_SUBIDA) return chico;
    throw new Error("La foto es demasiado pesada incluso achicada. Probá con otra.");
  } finally {
    imagen.close();
  }
}
