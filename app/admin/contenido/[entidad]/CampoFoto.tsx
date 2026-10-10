"use client";

// Campo "Foto de perfil" del form de agentes / profesionales.
// Spec: specs/foto-perfil-agentes-profesionales (US-1, US-2, US-3).
//
// No sube nada: devuelve un `CambioFoto` al form, que lo aplica DESPUÉS de
// guardar el registro (PUT|DELETE .../[id]/foto). Hasta entonces el recorte vive
// sólo en memoria del navegador — salir sin guardar no deja nada en el servidor.

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { leerDimensiones, validarArchivoFoto, validarDimensiones } from "@/lib/fotos/cliente";
import { FOTO_TIPOS_ACEPTADOS } from "@/lib/fotos/constantes";
import styles from "./foto.module.css";

// react-easy-crop sólo se descarga cuando el admin elige un archivo.
const RecorteFotoModal = dynamic(() => import("./RecorteFotoModal"), { ssr: false });

export type CambioFoto =
  | { tipo: "sin-cambios" }
  | { tipo: "nueva"; blob: Blob; previewUrl: string }
  | { tipo: "quitar" };

export interface CampoFotoProps {
  /** Para las iniciales cuando no hay foto. */
  nombre: string;
  /** Foto guardada hoy (null = sin foto, o registro nuevo). */
  fotoActualUrl: string | null;
  cambio: CambioFoto;
  onCambio: (cambio: CambioFoto) => void;
  disabled?: boolean;
}

export function CampoFoto({ nombre, fotoActualUrl, cambio, onCambio, disabled }: CampoFotoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // La vista previa (blob:) se libera cuando se reemplaza o se desmonta el campo.
  const previewUrl = cambio.tipo === "nueva" ? cambio.previewUrl : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const fotoVisible =
    cambio.tipo === "nueva" ? cambio.previewUrl : cambio.tipo === "quitar" ? null : fotoActualUrl;

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // Permite volver a elegir el mismo archivo después de cancelar.
    e.target.value = "";
    if (!archivo) return;

    setError(null);
    const invalido = await validarArchivoFoto(archivo);
    if (invalido) {
      setError(invalido);
      return;
    }

    const src = URL.createObjectURL(archivo);
    try {
      const { ancho, alto } = await leerDimensiones(src);
      const chica = validarDimensiones(ancho, alto);
      if (chica) {
        URL.revokeObjectURL(src);
        setError(chica);
        return;
      }
    } catch {
      URL.revokeObjectURL(src);
      setError("No se pudo leer la imagen. Probá con otro archivo.");
      return;
    }
    setOriginal(src);
  }

  function cerrarEditor() {
    if (original) URL.revokeObjectURL(original);
    setOriginal(null);
  }

  function onRecorte(blob: Blob) {
    cerrarEditor();
    onCambio({ tipo: "nueva", blob, previewUrl: URL.createObjectURL(blob) });
  }

  function quitar() {
    setError(null);
    // Descartar una foto recién elegida vuelve a la guardada; si no había, a "sin foto".
    onCambio(fotoActualUrl ? { tipo: "quitar" } : { tipo: "sin-cambios" });
  }

  return (
    <div className={styles.campo}>
      <span className={styles.campoLabel}>Foto de perfil</span>
      <div className={styles.fila}>
        <Avatar nombre={nombre || "?"} fotoUrl={fotoVisible} size={72} />
        <div className={styles.acciones}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {fotoVisible ? "Cambiar foto" : "Elegir foto"}
          </Button>
          {fotoVisible ? (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={quitar}>
              Quitar foto
            </Button>
          ) : null}
          {cambio.tipo === "quitar" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onCambio({ tipo: "sin-cambios" })}
            >
              Deshacer
            </Button>
          ) : null}
        </div>
      </div>
      <span className={styles.campoAyuda}>
        {cambio.tipo === "quitar"
          ? "La foto se va a quitar al guardar."
          : cambio.tipo === "nueva"
            ? "La foto nueva se guarda cuando guardes el ítem."
            : "JPG, PNG o WebP, hasta 5 MB y de al menos 256×256 px. Opcional."}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={FOTO_TIPOS_ACEPTADOS.join(",")}
        className={styles.inputArchivo}
        onChange={onArchivo}
        aria-label="Elegir foto de perfil"
        aria-describedby={error ? errorId : undefined}
        tabIndex={-1}
      />
      {error ? <FormError id={errorId}>{error}</FormError> : null}

      {original ? (
        <RecorteFotoModal imagenSrc={original} onConfirmar={onRecorte} onCancelar={cerrarEditor} />
      ) : null}
    </div>
  );
}
