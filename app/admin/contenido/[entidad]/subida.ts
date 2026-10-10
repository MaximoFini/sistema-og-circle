// VGRP-88 — subida de un material desde el navegador del admin, directo a Storage.
//
// Por qué así y no un POST con el archivo: un archivo de 50 MB no entra en el body de una
// Server Action (~1 MB) ni de un route handler de Vercel (~4,5 MB). El servidor solo
// autoriza (`POST /api/admin/contenido/materiales/subida` devuelve una URL firmada para un
// path puntual) y el archivo viaja del navegador a Storage.
//
// XMLHttpRequest y no fetch: fetch no expone el progreso de SUBIDA, y la barra con el
// porcentaje real (más "Cancelar") es un requisito (US-7).

import { extensionDe, formatearTamano, MAX_BYTES } from "@/lib/materiales/tipos";

/** El error para mostrarle al admin ANTES de subir nada, o `null` si el archivo sirve. */
export function validarArchivo(nombre: string, tamanoBytes: number): string | null {
  if (!extensionDe(nombre)) {
    return "Ese tipo de archivo no está permitido. Subí un PDF, PowerPoint, Excel o Word.";
  }
  if (tamanoBytes <= 0) return "El archivo está vacío.";
  if (tamanoBytes > MAX_BYTES) {
    return `El archivo pesa ${formatearTamano(tamanoBytes)} y el máximo es ${formatearTamano(MAX_BYTES)}.`;
  }
  return null;
}

/** "Checklist de importación.v2.pdf" → "Checklist de importación.v2": sugerencia de título. */
export function tituloSugerido(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf(".");
  const base = punto > 0 ? nombreArchivo.slice(0, punto) : nombreArchivo;
  return base.replace(/[_\s]+/g, " ").trim();
}

export interface SubidaAutorizada {
  path: string;
  signedUrl: string;
  contentType: string;
}

/** Pide al servidor una URL de subida firmada. Tira con el mensaje para el admin. */
export async function autorizarSubida(archivo: File): Promise<SubidaAutorizada> {
  const res = await fetch("/api/admin/contenido/materiales/subida", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nombreArchivo: archivo.name, tamanoBytes: archivo.size }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<SubidaAutorizada> & {
    error?: string;
  };
  if (!res.ok || !data.path || !data.signedUrl || !data.contentType) {
    throw new Error(data.error ?? "No se pudo preparar la subida.");
  }
  return { path: data.path, signedUrl: data.signedUrl, contentType: data.contentType };
}

/** Descarta un archivo pendiente (best effort: si falla, lo barre el servidor pasadas 24 h). */
export async function descartarPendiente(path: string): Promise<void> {
  await fetch("/api/admin/contenido/materiales/subida", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => undefined);
}

export class SubidaCancelada extends Error {
  constructor() {
    super("Subida cancelada.");
    this.name = "SubidaCancelada";
  }
}

export interface SubidaEnCurso {
  promesa: Promise<void>;
  cancelar: () => void;
}

/**
 * Sube `archivo` a la URL firmada con PUT, informando el progreso (0–100). Mismo formato que
 * `uploadToSignedUrl` de supabase-js en el navegador (multipart con `cacheControl` y el
 * archivo), pero el archivo va como Blob con el Content-Type que dio el servidor: así el
 * MIME que ve el bucket (`allowed_mime_types`) no depende de lo que adivine el sistema
 * operativo (un .csv en Windows llega como application/vnd.ms-excel).
 */
export function subirConProgreso(
  subida: SubidaAutorizada,
  archivo: Blob,
  onProgreso: (porcentaje: number) => void,
  crearXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): SubidaEnCurso {
  const xhr = crearXhr();
  const promesa = new Promise<void>((resolve, reject) => {
    // El navegador dispara decenas de eventos por segundo: solo se avisa cuando cambia el entero.
    let ultimo = -1;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || e.total <= 0) return;
      const porcentaje = Math.min(100, Math.round((e.loaded / e.total) * 100));
      if (porcentaje === ultimo) return;
      ultimo = porcentaje;
      onProgreso(porcentaje);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgreso(100);
        resolve();
        return;
      }
      reject(new Error(mensajeErrorStorage(xhr.status)));
    };
    xhr.onerror = () => reject(new Error("Se cortó la conexión mientras subía el archivo."));
    xhr.onabort = () => reject(new SubidaCancelada());

    const cuerpo = new FormData();
    cuerpo.append("cacheControl", "3600");
    cuerpo.append("", new Blob([archivo], { type: subida.contentType }));
    xhr.open("PUT", subida.signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(cuerpo);
  });
  return { promesa, cancelar: () => xhr.abort() };
}

function mensajeErrorStorage(status: number): string {
  if (status === 413) return "El archivo supera el máximo permitido.";
  if (status === 415) return "Storage rechazó el tipo de archivo.";
  if (status === 400 || status === 403) {
    return "La autorización para subir venció o no es válida. Volvé a intentar.";
  }
  return "No se pudo subir el archivo. Volvé a intentar.";
}
