// Foto de perfil de agentes y profesionales — validación y normalización en el
// SERVIDOR. No confía en nada de lo que mandó el navegador (el recorte del
// cliente puede venir manipulado): detecta el formato real por el contenido,
// valida dimensiones y re-encodea siempre a WebP 512×512 sin metadatos.
// Spec: specs/foto-perfil-agentes-profesionales/design.md (§Interfaces, PUT /foto).

import "server-only";

import sharp from "sharp";
import { FOTO_MIN_PX, FOTO_SALIDA_PX, FOTO_SUBIDA_MAX_BYTES } from "./constantes";

/** Error de validación con un mensaje apto para mostrarle al admin. */
export class FotoInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FotoInvalida";
  }
}

// Formatos según los detecta libvips por los bytes, no por extensión ni Content-Type.
const FORMATOS_ACEPTADOS = new Set(["jpeg", "png", "webp"]);

export async function procesarFoto(entrada: Buffer): Promise<Buffer> {
  if (entrada.byteLength === 0) {
    throw new FotoInvalida("El archivo está vacío.");
  }
  if (entrada.byteLength > FOTO_SUBIDA_MAX_BYTES) {
    throw new FotoInvalida("La foto es demasiado pesada. Probá con otra imagen.");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(entrada).metadata();
  } catch {
    throw new FotoInvalida("El archivo no es una imagen válida.");
  }

  if (!metadata.format || !FORMATOS_ACEPTADOS.has(metadata.format)) {
    throw new FotoInvalida("Formato no permitido. Usá JPG, PNG o WebP.");
  }

  // `autoOrient` = dimensiones ya rotadas según EXIF (una foto vertical de
  // celular viene apaisada en los bytes crudos).
  const ancho = metadata.autoOrient?.width ?? metadata.width;
  const alto = metadata.autoOrient?.height ?? metadata.height;
  if (!ancho || !alto) {
    throw new FotoInvalida("El archivo no es una imagen válida.");
  }
  if (ancho < FOTO_MIN_PX || alto < FOTO_MIN_PX) {
    throw new FotoInvalida(
      `La imagen es muy chica. Tiene que medir al menos ${FOTO_MIN_PX}×${FOTO_MIN_PX} px.`,
    );
  }

  try {
    // `rotate()` sin argumentos aplica la orientación EXIF; sharp NO copia
    // metadatos a la salida salvo que se pida `withMetadata()`, así que el
    // WebP final sale sin EXIF (ubicación, cámara, etc.). `fit: cover` recorta
    // al centro si llega algo no cuadrado.
    return await sharp(entrada, { failOn: "error" })
      .rotate()
      .resize(FOTO_SALIDA_PX, FOTO_SALIDA_PX, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new FotoInvalida("No se pudo leer la imagen. Probá con otro archivo.");
  }
}
