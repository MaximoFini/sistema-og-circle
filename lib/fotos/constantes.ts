// Foto de perfil de agentes y profesionales — contrato compartido entre el
// editor (cliente), el procesado (servidor) y la lectura pública.
// Spec: specs/foto-perfil-agentes-profesionales/design.md
//
// Sin imports: lo usan tanto `lib/fotos/cliente.ts` (bundle del navegador)
// como `lib/fotos/procesar.ts` (sharp, sólo servidor).

/** Las únicas entidades con foto. Subconjunto de `ENTIDADES` de contenido. */
export const ENTIDADES_CON_FOTO = ["agentes", "profesionales"] as const;
export type EntidadConFoto = (typeof ENTIDADES_CON_FOTO)[number];

export function tieneFoto(entidad: string): entidad is EntidadConFoto {
  return (ENTIDADES_CON_FOTO as readonly string[]).includes(entidad);
}

export const FOTO_BUCKET = "fotos-directorio";

/** Tope del archivo ORIGINAL que el admin elige (se valida en el navegador). */
export const FOTO_ORIGINAL_MAX_BYTES = 5 * 1024 * 1024;
/** Tope de lo que recibe el servidor: el recorte ya reducido (~50–200 KB). */
export const FOTO_SUBIDA_MAX_BYTES = 2 * 1024 * 1024;
/** Lado mínimo aceptado, en píxeles. */
export const FOTO_MIN_PX = 256;
/** Lado de la foto guardada (cuadrada). */
export const FOTO_SALIDA_PX = 512;

export const FOTO_TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp"] as const;
