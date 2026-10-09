"use client";

// VGRP-88 — alta y edición de un material. Aparte de ContenidoForm porque lleva un archivo:
// el archivo se sube primero (SubidorArchivo, directo a Storage) y el form manda solo el path
// pendiente. Al crear, el material queda PUBLICADO (decisión del usuario).
//
// Edición: título, descripción, publicado/oculto y "Reemplazar archivo" (conserva título,
// orden y publicado). Borrar pide confirmación y se lleva también el archivo.

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Checkbox, FormError } from "@/components/ui";
import { EXTENSIONES, type ExtensionMaterial, formatearTamano } from "@/lib/materiales/tipos";
import styles from "../../admin.module.css";
import { SubidorArchivo } from "./SubidorArchivo";
import { tituloSugerido } from "./subida";

export interface MaterialEditable {
  id: string;
  titulo: string;
  descripcion: string | null;
  publicado: boolean;
  extension: string;
  tamano_bytes: number;
}

interface RespuestaError {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const URL_BASE = "/api/admin/contenido/materiales";

function describirArchivo(item: MaterialEditable): string {
  const ext = item.extension as ExtensionMaterial;
  const tipo = EXTENSIONES[ext]?.tipo ?? item.extension;
  return `${tipo.toUpperCase()} (.${item.extension}) · ${formatearTamano(Number(item.tamano_bytes))}`;
}

export function MaterialForm({ item }: { item?: MaterialEditable }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(item?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [publicado, setPublicado] = useState(item?.publicado ?? true);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTitulo, setErrorTitulo] = useState<string | null>(null);

  const faltaArchivo = !item && !pendiente;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (faltaArchivo || subiendo) return;
    setEnviando(true);
    setError(null);
    setErrorTitulo(null);

    const cuerpo = {
      titulo,
      descripcion: descripcion.trim() ? descripcion : null,
      ...(item ? { publicado } : {}),
      ...(pendiente ? { storage_path_pendiente: pendiente } : {}),
    };

    try {
      const res = await fetch(item ? `${URL_BASE}/${item.id}` : URL_BASE, {
        method: item ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (res.ok) {
        router.push("/admin/contenido/materiales");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      setErrorTitulo(data.fieldErrors?.titulo?.[0] ?? null);
      setError(data.error ?? "No se pudo guardar.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
    }
  }

  async function onBorrar() {
    if (!item) return;
    if (
      !window.confirm("¿Borrar este material? Se borra también el archivo y no se puede deshacer.")
    ) {
      return;
    }
    setBorrando(true);
    setError(null);
    try {
      const res = await fetch(`${URL_BASE}/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/contenido/materiales");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      setError(data.error ?? "No se pudo borrar.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={onSubmit}>
      <div className={styles.formCampo}>
        <span className={styles.formLabel}>{item ? "Archivo" : "Archivo *"}</span>
        {item ? <span className={styles.formAyuda}>Actual: {describirArchivo(item)}</span> : null}
        <SubidorArchivo
          etiqueta={item ? "Reemplazar archivo" : "Elegir archivo"}
          onSubido={(path, archivo) => {
            setPendiente(path);
            // Sugiere el título desde el nombre del archivo solo si todavía está vacío.
            if (!titulo.trim()) setTitulo(tituloSugerido(archivo.name));
          }}
          onLimpiar={() => setPendiente(null)}
          onOcupado={setSubiendo}
        />
      </div>

      <label className={styles.formCampo}>
        <span className={styles.formLabel}>Título *</span>
        <input
          type="text"
          className={styles.inputNativo}
          value={titulo}
          maxLength={200}
          required
          aria-invalid={errorTitulo ? true : undefined}
          aria-describedby={errorTitulo ? "error-titulo" : undefined}
          onChange={(e) => setTitulo(e.target.value)}
        />
        {errorTitulo ? <FormError id="error-titulo">{errorTitulo}</FormError> : null}
      </label>

      <label className={styles.formCampo}>
        <span className={styles.formLabel}>Descripción</span>
        <span id="ayuda-descripcion" className={styles.formAyuda}>
          Opcional. Una línea que explique para qué sirve.
        </span>
        <textarea
          className={styles.textareaNativo}
          value={descripcion}
          maxLength={500}
          aria-describedby="ayuda-descripcion"
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>

      {item ? (
        <Checkbox
          label="Publicado (visible en Formación)"
          checked={publicado}
          onChange={(e) => setPublicado(e.target.checked)}
        />
      ) : null}

      <FormError>{error}</FormError>

      <div className={styles.formAcciones}>
        <Button type="submit" loading={enviando} disabled={faltaArchivo || subiendo}>
          {item ? "Guardar cambios" : "Crear y publicar"}
        </Button>
        {item ? (
          <Button type="button" variant="ghost" loading={borrando} onClick={onBorrar}>
            Borrar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
