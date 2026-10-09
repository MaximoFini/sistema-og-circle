// Foto de perfil de agentes y profesionales — validación y recorte en el
// NAVEGADOR del admin. Spec: specs/foto-perfil-agentes-profesionales/design.md
//
// La validación de acá es para dar feedback inmediato; el servidor
// (lib/fotos/procesar.ts) vuelve a validar todo y re-encodea, así que nada de
// lo que pase o falle acá es una garantía de seguridad.

import {
  FOTO_MIN_PX,
  FOTO_ORIGINAL_MAX_BYTES,
  FOTO_SALIDA_PX,
  FOTO_TIPOS_ACEPTADOS,
} from "./constantes";

type TipoFoto = (typeof FOTO_TIPOS_ACEPTADOS)[number];

/** Tipo real por los primeros bytes (firma), sin mirar extensión ni `file.type`. */
export function detectarTipo(bytes: Uint8Array): TipoFoto | null {
  const b = (i: number) => bytes[i];
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (
    b(0) === 0x89 &&
    b(1) === 0x50 &&
    b(2) === 0x4e &&
    b(3) === 0x47 &&
    b(4) === 0x0d &&
    b(5) === 0x0a &&
    b(6) === 0x1a &&
    b(7) === 0x0a
  ) {
    return "image/png";
  }
  const ascii = (desde: number, hasta: number) =>
    String.fromCharCode(...bytes.subarray(desde, hasta));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Chequeos que no necesitan decodificar la imagen: tamaño, tipo declarado y
 * firma real. Devuelve el mensaje de error para el admin, o `null` si pasa.
 */
export async function validarArchivoFoto(archivo: File): Promise<string | null> {
  if (archivo.size === 0) return "El archivo está vacío.";
  if (archivo.size > FOTO_ORIGINAL_MAX_BYTES) {
    const mb = FOTO_ORIGINAL_MAX_BYTES / (1024 * 1024);
    return `La imagen pesa más de ${mb} MB. Elegí una más liviana.`;
  }
  const declarado = (FOTO_TIPOS_ACEPTADOS as readonly string[]).includes(archivo.type);
  const real = detectarTipo(new Uint8Array(await archivo.slice(0, 12).arrayBuffer()));
  if (!declarado || !real) return "Formato no permitido. Usá JPG, PNG o WebP.";
  return null;
}

/** Mensaje de error si la imagen ya decodificada es más chica que el mínimo. */
export function validarDimensiones(ancho: number, alto: number): string | null {
  if (ancho < FOTO_MIN_PX || alto < FOTO_MIN_PX) {
    return `La imagen es muy chica. Tiene que medir al menos ${FOTO_MIN_PX}×${FOTO_MIN_PX} px.`;
  }
  return null;
}

/** Área a recortar en píxeles de la imagen original (lo que entrega react-easy-crop). */
export interface AreaPixeles {
  x: number;
  y: number;
  width: number;
  height: number;
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = src;
  });
}

/** Dimensiones reales (ya decodificadas) de una imagen, p. ej. de un `blob:`. */
export async function leerDimensiones(src: string): Promise<{ ancho: number; alto: number }> {
  const img = await cargarImagen(src);
  return { ancho: img.naturalWidth, alto: img.naturalHeight };
}

/**
 * Dibuja el área elegida en un canvas de 512×512 y lo exporta como WebP. Volver
 * a dibujar en un canvas descarta el EXIF. Si el navegador no sabe exportar
 * WebP (Safari viejo) `toBlob` devuelve PNG: el servidor lo acepta igual y lo
 * re-encodea.
 */
export async function recortarAFoto(src: string, area: AreaPixeles): Promise<Blob> {
  const img = await cargarImagen(src);
  const canvas = document.createElement("canvas");
  canvas.width = FOTO_SALIDA_PX;
  canvas.height = FOTO_SALIDA_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite recortar imágenes.");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, FOTO_SALIDA_PX, FOTO_SALIDA_PX);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la foto."))),
      "image/webp",
      0.85,
    );
  });
}
