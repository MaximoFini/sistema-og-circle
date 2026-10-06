"use client";

// Port de vegroup@b550803 src/components/ProformaUpload.jsx — sube una
// proforma / packing list y deja que la IA extraiga los datos.
//
// Diferencias con el original:
// - Límite de 3 MB, no 8 (decisión del equipo, requirements-vgrp57.md US-4):
//   el archivo viaja en base64 (+33%) y Vercel corta los pedidos de más de
//   4,5 MB, así que los 8 MB anunciados nunca funcionaron. Se avisa antes de
//   subir y se rechaza en el navegador; el endpoint devuelve 413 igual.
// - Liquid Glass: `inset` (vive dentro de la tarjeta de producto) en vez de
//   una `.card` anidada; la zona de arrastre es un <button> (teclado y foco).

import { useRef, useState } from "react";
import { FormError } from "@/components/ui/FormError";
import { Icon } from "@/components/ui/Icon";
import { type DatosProforma, extractDocument, fileToBase64 } from "@/lib/cotizador/api";
import styles from "./cotizador.module.css";

export const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;
export const MAX_MB = 3;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/**
 * Valida tipo y tamaño antes de leer/subir el archivo. Devuelve el mensaje de
 * error para el usuario, o `null` si se puede subir. Mismo orden que el
 * original: primero el formato, después el peso.
 */
export function validarArchivo(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) {
    return "Formato no soportado. Subí una imagen (JPG, PNG, WebP o GIF) o un PDF.";
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toLocaleString("es-AR", { maximumFractionDigits: 1 });
    return `El archivo pesa ${mb} MB y el máximo es ${MAX_MB} MB. Subí uno más liviano.`;
  }
  return null;
}

export interface ProformaUploadProps {
  onExtracted: (datos: DatosProforma) => void;
  id?: string;
}

export function ProformaUpload({ onExtracted, id }: ProformaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [drag, setDrag] = useState(false);
  const [filename, setFilename] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setInfo("");
    const invalido = validarArchivo(file);
    if (invalido) {
      setError(invalido);
      return;
    }
    setFilename(file.name);
    setLoading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const data = await extractDocument({ fileBase64, mediaType: file.type, filename: file.name });
      onExtracted(data);
      setInfo(`Datos extraídos de "${file.name}". Revisá y ajustá si hace falta.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.proforma} id={id} aria-labelledby={id ? `${id}-titulo` : undefined}>
      <h3 className={styles.proformaTitulo} id={id ? `${id}-titulo` : undefined}>
        <span className={styles.proformaIcono} aria-hidden="true">
          <Icon name="subir" size={16} />
        </span>
        Subir proforma / packing list
      </h3>
      <p className={styles.proformaDesc}>
        La IA lee el documento y completa automáticamente el producto, FOB, peso, cajas, dimensiones
        y unidades.
      </p>

      <button
        type="button"
        className={drag ? `${styles.dropzone} ${styles.dropzoneActiva}` : styles.dropzone}
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        aria-describedby={id ? `${id}-ayuda` : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        {loading ? (
          <span className={styles.dropzoneCargando}>
            <span className={styles.spinner} aria-hidden="true" />
            Analizando “{filename}”…
          </span>
        ) : (
          <>
            <Icon name="documento" size={26} className={styles.dropzoneIcono} />
            <span className={styles.dropzoneTitulo}>
              Arrastrá el archivo o hacé clic para elegir
            </span>
            <span className={styles.dropzoneAyuda} id={id ? `${id}-ayuda` : undefined}>
              JPG · PNG · WebP · PDF — hasta {MAX_MB} MB
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className={styles.inputArchivo}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          // Permite volver a elegir el mismo archivo después de un error.
          e.target.value = "";
        }}
      />

      <FormError>{error}</FormError>
      <div role="status">
        {info ? (
          <div className={styles.aviso}>
            <p className={styles.avisoTexto}>{info}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
