"use client";

// VGRP-88 — elegir y subir el archivo de un material, con barra de progreso real y Cancelar.
//
// 1. Al elegir el archivo se valida tipo y tamaño ACÁ, antes de pedir nada al servidor.
// 2. El servidor autoriza (URL de subida firmada para `pendientes/<uuid>.<ext>`).
// 3. El navegador sube directo a Storage por XHR (progreso + cancelar).
// 4. Listo: `onSubido(path)`. El material recién se crea/reemplaza cuando el form guarda.
//
// Si se cancela, falla o el admin quita el archivo, el pendiente se descarta (best effort; lo
// que quede lo barre el servidor pasadas 24 h).

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { ACCEPT_MATERIALES, formatearTamano } from "@/lib/materiales/tipos";
import adminStyles from "../../admin.module.css";
import styles from "./materiales-admin.module.css";
import {
  autorizarSubida,
  descartarPendiente,
  SubidaCancelada,
  type SubidaEnCurso,
  subirConProgreso,
  validarArchivo,
} from "./subida";

type Fase =
  | { tipo: "vacio" }
  | { tipo: "preparando"; nombre: string }
  | { tipo: "subiendo"; nombre: string; progreso: number }
  | { tipo: "listo"; nombre: string; tamano: number; path: string };

export interface SubidorArchivoProps {
  /** Texto del botón para elegir ("Elegir archivo", "Reemplazar archivo"). */
  etiqueta: string;
  /** El archivo terminó de subir: `path` es el pendiente para mandar al guardar. */
  onSubido: (path: string, archivo: File) => void;
  /** Ya no hay archivo pendiente (se quitó, se canceló o falló). */
  onLimpiar: () => void;
  /** Avisa si hay una subida en curso (el form no deja guardar mientras tanto). */
  onOcupado: (ocupado: boolean) => void;
}

export function SubidorArchivo({ etiqueta, onSubido, onLimpiar, onOcupado }: SubidorArchivoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const subidaRef = useRef<SubidaEnCurso | null>(null);
  const [fase, setFase] = useState<Fase>({ tipo: "vacio" });
  const [error, setError] = useState<string | null>(null);

  // Si el admin se va de la pantalla a mitad de una subida, se corta.
  useEffect(() => () => subidaRef.current?.cancelar(), []);

  function terminar(nueva: Fase) {
    subidaRef.current = null;
    onOcupado(false);
    setFase(nueva);
  }

  async function onElegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después de un error
    if (!archivo) return;

    setError(null);
    const invalido = validarArchivo(archivo.name, archivo.size);
    if (invalido) {
      setError(invalido);
      return;
    }

    // Un archivo anterior ya subido y sin guardar deja de servir.
    if (fase.tipo === "listo") {
      void descartarPendiente(fase.path);
      onLimpiar();
    }

    onOcupado(true);
    setFase({ tipo: "preparando", nombre: archivo.name });
    let path: string | null = null;
    try {
      const subida = await autorizarSubida(archivo);
      path = subida.path;
      setFase({ tipo: "subiendo", nombre: archivo.name, progreso: 0 });
      subidaRef.current = subirConProgreso(subida, archivo, (progreso) =>
        setFase({ tipo: "subiendo", nombre: archivo.name, progreso }),
      );
      await subidaRef.current.promesa;
      terminar({ tipo: "listo", nombre: archivo.name, tamano: archivo.size, path: subida.path });
      onSubido(subida.path, archivo);
    } catch (err) {
      if (path) void descartarPendiente(path);
      terminar({ tipo: "vacio" });
      onLimpiar();
      setError(
        err instanceof SubidaCancelada
          ? "Subida cancelada."
          : err instanceof Error
            ? err.message
            : "No se pudo subir el archivo.",
      );
    }
  }

  function quitar() {
    if (fase.tipo !== "listo") return;
    void descartarPendiente(fase.path);
    setFase({ tipo: "vacio" });
    onLimpiar();
  }

  const ocupado = fase.tipo === "preparando" || fase.tipo === "subiendo";

  return (
    <div className={styles.subidor}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MATERIALES}
        className={styles.inputOculto}
        onChange={onElegir}
        tabIndex={-1}
        aria-hidden="true"
      />

      {fase.tipo === "listo" ? (
        <div className={styles.filaAcciones}>
          <span className={styles.archivo}>{fase.nombre}</span>
          <span className={styles.meta}>{formatearTamano(fase.tamano)} · listo para guardar</span>
          <Button type="button" variant="ghost" size="sm" onClick={quitar}>
            Quitar
          </Button>
        </div>
      ) : null}

      {ocupado ? (
        <div className={styles.progreso} aria-live="polite">
          <span className={styles.archivo}>{fase.nombre}</span>
          <progress
            className={styles.barra}
            max={100}
            value={fase.tipo === "subiendo" ? fase.progreso : undefined}
            aria-label={`Subiendo ${fase.nombre}`}
          />
          <div className={styles.filaAcciones}>
            <span className={styles.meta}>
              {fase.tipo === "subiendo" ? `Subiendo… ${fase.progreso}%` : "Preparando la subida…"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={fase.tipo !== "subiendo"}
              onClick={() => subidaRef.current?.cancelar()}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.filaAcciones}>
          <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()}>
            {fase.tipo === "listo" ? "Elegir otro archivo" : etiqueta}
          </Button>
          <span className={adminStyles.formAyuda}>PDF, PowerPoint, Excel o Word. Hasta 50 MB.</span>
        </div>
      )}

      <FormError>{error}</FormError>
    </div>
  );
}
