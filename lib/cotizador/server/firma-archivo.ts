// Auditoría de seguridad nov 2026: las subidas de la calculadora (proformas, fotos de
// producto) validaban sólo el `mediaType` que declara el cliente. Esto confirma que los
// primeros bytes del contenido coinciden con ese tipo ("magic bytes").

const FIRMAS: Record<string, (b: Uint8Array) => boolean> = {
  "application/pdf": (b) => empieza(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  "image/png": (b) => empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (b) => empieza(b, [0xff, 0xd8, 0xff]),
  "image/gif": (b) => empieza(b, [0x47, 0x49, 0x46, 0x38]), // GIF8
  // RIFF....WEBP
  "image/webp": (b) =>
    empieza(b, [0x52, 0x49, 0x46, 0x46]) && empieza(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
};

function empieza(bytes: Uint8Array, prefijo: number[]): boolean {
  return prefijo.every((v, i) => bytes[i] === v);
}

/** `true` si el contenido base64 arranca con la firma del `mediaType` declarado. */
export function coincideConMediaType(base64: string, mediaType: string): boolean {
  const verificar = FIRMAS[mediaType];
  if (!verificar) return false;
  // 16 caracteres base64 alcanzan para los primeros 12 bytes.
  const bytes = Buffer.from(base64.slice(0, 16), "base64");
  return verificar(bytes);
}
