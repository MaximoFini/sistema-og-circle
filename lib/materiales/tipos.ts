// VGRP-88 — vocabulario compartido de los materiales descargables de /formacion.
//
// Puro y SIN "server-only" a propósito: lo usan el admin (cliente: validar el
// archivo antes de subirlo, mostrar el tamaño), la lista pública (cliente) y el
// servidor (derivar tipo/extensión). El `tipo`, la `extension` y el tamaño que
// llegan a la base los deriva siempre el servidor con estas funciones, nunca el
// body del request.

/** Tope por archivo: el límite del plan Free de Supabase Storage y el
 *  `file_size_limit` del bucket (migración 20261009120000_materiales.sql). */
export const MAX_BYTES = 50 * 1024 * 1024;

/** Tope de TODO el proyecto en el plan Free (1 GiB). Es una cota optimista para el
 *  indicador del admin: otros buckets (fotos-directorio) también cuentan. */
export const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024;

export type TipoMaterial = "pdf" | "powerpoint" | "excel" | "word";

// La extensión manda; el MIME del navegador no es confiable (un .csv llega como
// text/csv o application/vnd.ms-excel según el sistema). El MIME de acá es el
// Content-Type con el que se sube, y tiene que estar en `allowed_mime_types` del bucket.
export const EXTENSIONES = {
  pdf: { tipo: "pdf", mime: "application/pdf" },
  ppt: { tipo: "powerpoint", mime: "application/vnd.ms-powerpoint" },
  pptx: {
    tipo: "powerpoint",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  xls: { tipo: "excel", mime: "application/vnd.ms-excel" },
  xlsx: {
    tipo: "excel",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  csv: { tipo: "excel", mime: "text/csv" },
  doc: { tipo: "word", mime: "application/msword" },
  docx: {
    tipo: "word",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
} as const satisfies Record<string, { tipo: TipoMaterial; mime: string }>;

export type ExtensionMaterial = keyof typeof EXTENSIONES;

/** Lo que ve el usuario de un material: nunca incluye `storage_path`. */
export interface MaterialItem {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoMaterial;
  extension: ExtensionMaterial;
  tamanoBytes: number;
}

/** Layout del bucket `materiales`: lo subido pero todavía sin guardar vive en `pendientes/`
 *  (lo que tenga más de 24 h es huérfano por definición); el archivo de un material ya
 *  guardado vive en `archivos/`. */
export const PREFIJO_PENDIENTES = "pendientes/";
export const PREFIJO_ARCHIVOS = "archivos/";

/**
 * Forma de un path pendiente: `pendientes/<uuid>.<ext>`, sin subcarpetas ni traversal. Es lo
 * único que el admin puede mandar como "este es el archivo": impide apuntar a un archivo ya
 * guardado de otro material o a cualquier otro objeto del bucket.
 */
export const PATH_PENDIENTE_REGEX =
  /^pendientes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|pptx?|xlsx?|csv|docx?)$/;

/** Valor del atributo `accept` del input de archivo del admin. */
export const ACCEPT_MATERIALES = Object.keys(EXTENSIONES)
  .map((ext) => `.${ext}`)
  .join(",");

/**
 * La extensión (en minúsculas) si es una de las permitidas; `null` si no hay
 * extensión o no está en la lista. Toma el último segmento: `a.tar.pdf` → `pdf`.
 */
export function extensionDe(nombreArchivo: string): ExtensionMaterial | null {
  const punto = nombreArchivo.lastIndexOf(".");
  if (punto <= 0) return null; // sin punto, o archivo oculto (`.pdf` sin nombre)
  const ext = nombreArchivo.slice(punto + 1).toLowerCase();
  return Object.hasOwn(EXTENSIONES, ext) ? (ext as ExtensionMaterial) : null;
}

const MAX_LARGO_NOMBRE = 120;
// Caracteres que ningún sistema de archivos acepta (o que rompen Content-Disposition),
// más los de control. Se conservan tildes y ñ.
// biome-ignore lint/suspicious/noControlCharactersInRegex: justamente se filtran los de control
const INVALIDOS_EN_NOMBRE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/**
 * Nombre con el que se descarga el archivo: el título del material más la extensión
 * original. "Checklist de importación" + "pdf" → "Checklist de importación.pdf".
 */
export function nombreDescarga(titulo: string, extension: string): string {
  const base = titulo
    .replace(INVALIDOS_EN_NOMBRE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LARGO_NOMBRE)
    .replace(/^[.\s]+|[.\s]+$/g, ""); // sin puntos/espacios en los bordes
  return `${base || "material"}.${extension.toLowerCase()}`;
}

const formatoTamano = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** "850 KB", "2,3 MB", "1 GB". Base 1024, un decimal como máximo. */
export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${formatoTamano.format(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${formatoTamano.format(mb)} MB`;
  return `${formatoTamano.format(mb / 1024)} GB`;
}
