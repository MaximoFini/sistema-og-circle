"use client";

// VGRP-70 — "Identificar con una foto" en el paso 1 del cotizador marítimo.
// La IA mira la foto y propone una descripción del producto; desde ahí sigue
// el flujo de siempre (CotizadorMaritimo detecta la NCM sola al cambiar el
// texto). Ver specs/bloque-12-calculadoras/design-vgrp70.md.
//
// - La foto se achica en el navegador (lib/cotizador/achicarImagen.ts) y no
//   se guarda en ningún lado: sólo pasa por Anthropic.
// - Nunca bloquea: con error, confianza baja o sin tocarla, el campo de
//   descripción sigue editable.
// - Sin `capture="environment"` a propósito: con `capture` el celular abre
//   la cámara directo y no deja elegir de la galería; sin él, iOS y Android
//   ofrecen las dos cosas.
// - Lo carga CotizadorMaritimo con next/dynamic: no pesa hasta abrir el
//   marítimo.
//
// Pensado para sumarse al courier después sin cambios: no sabe nada del
// marítimo, sólo recibe la descripción actual y devuelve una nueva.

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Icon } from "@/components/ui/Icon";
import { achicarImagen } from "@/lib/cotizador/achicarImagen";
import { fileToBase64, identificarProducto, type ProductoIdentificado } from "@/lib/cotizador/api";
import styles from "./cotizador.module.css";

/** Debajo de esto no se completa el campo solo: se muestra y se pregunta. */
const CONFIANZA_MINIMA = 40;

export interface FotoProductoProps {
  /** Lo que ya está escrito en "Descripción del producto". */
  descripcionActual: string;
  onDescripcion: (texto: string) => void;
}

type Estado =
  | { tipo: "idle" }
  | { tipo: "analizando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; r: ProductoIdentificado; texto: string; pendiente: boolean };

export function textoDescripcion({ producto, detalle }: ProductoIdentificado): string {
  return detalle ? `${producto}. ${detalle}` : producto;
}

export function FotoProducto({ descripcionActual, onDescripcion }: FotoProductoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });
  const [arrastrando, setArrastrando] = useState(false);
  const id = useId();

  async function analizar(archivo: File | undefined) {
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      setEstado({ tipo: "error", mensaje: "Elegí una imagen: una foto JPG, PNG o WebP." });
      return;
    }
    setEstado({ tipo: "analizando" });
    try {
      const jpeg = await achicarImagen(archivo);
      const r = await identificarProducto({
        fileBase64: await fileToBase64(jpeg),
        mediaType: "image/jpeg",
      });
      const texto = textoDescripcion(r);
      const confiable = r.producto !== "" && r.confianza >= CONFIANZA_MINIMA;
      // Se completa solo únicamente si es confiable y no pisa nada escrito.
      const pendiente = !confiable || descripcionActual.trim() !== "";
      if (!pendiente) onDescripcion(texto);
      setEstado({ tipo: "listo", r, texto, pendiente });
    } catch (e) {
      // El motivo (formato, peso, IA caída) + la salida: la foto nunca bloquea.
      const motivo = (e instanceof Error && e.message) || "No pudimos analizar la foto.";
      setEstado({ tipo: "error", mensaje: `${motivo} Podés escribir el producto a mano.` });
    }
  }

  function usar(texto: string) {
    onDescripcion(texto);
    setEstado((s) => (s.tipo === "listo" ? { ...s, pendiente: false } : s));
  }

  const analizando = estado.tipo === "analizando";

  return (
    <div className={styles.fotoProducto}>
      <Button
        variant="ghost"
        size="sm"
        className={arrastrando ? `${styles.fotoBoton} ${styles.fotoBotonActivo}` : styles.fotoBoton}
        onClick={() => inputRef.current?.click()}
        loading={analizando}
        aria-describedby={`${id}-ayuda`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void analizar(e.dataTransfer.files?.[0]);
        }}
      >
        {!analizando && <Icon name="subir" size={16} />}
        Identificar con una foto
      </Button>
      <p className={styles.ayuda} id={`${id}-ayuda`}>
        Sacale una foto al producto o subí una. La IA describe qué es y completa el campo. La foto
        no se guarda.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.inputArchivo}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void analizar(e.target.files?.[0]);
          // Permite volver a elegir la misma foto después de un error.
          e.target.value = "";
        }}
      />

      <div role="status">
        {analizando && (
          <div className={styles.aviso}>
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.avisoTexto}>Mirando la foto…</p>
          </div>
        )}
        {estado.tipo === "listo" && (
          <p className={styles.srOnly}>
            {estado.pendiente
              ? `La IA propone: ${estado.r.producto || "no reconoció un producto"}, con ${estado.r.confianza}% de confianza.`
              : `Descripción completada con la foto: ${estado.r.producto}.`}
          </p>
        )}
      </div>
      {estado.tipo === "error" && <FormError>{estado.mensaje}</FormError>}

      {estado.tipo === "listo" && (
        <Resultado
          r={estado.r}
          pendiente={estado.pendiente}
          sobreescribe={descripcionActual.trim() !== "" && descripcionActual !== estado.texto}
          onUsar={() => usar(estado.texto)}
          onDescartar={() => setEstado({ tipo: "idle" })}
        />
      )}
    </div>
  );
}

function Resultado({
  r,
  pendiente,
  sobreescribe,
  onUsar,
  onDescartar,
}: {
  r: ProductoIdentificado;
  pendiente: boolean;
  sobreescribe: boolean;
  onUsar: () => void;
  onDescartar: () => void;
}) {
  const baja = r.producto === "" || r.confianza < CONFIANZA_MINIMA;
  return (
    <div className={styles.ncmHit}>
      <div className={styles.ncmCabecera}>
        <span className={styles.fotoTitulo}>Lo que vemos en la foto</span>
        <span className={styles.ncmMeta}>
          Confianza: <strong>{r.confianza}%</strong>
        </span>
      </div>
      <progress className={styles.confianza} max={100} value={r.confianza} aria-hidden="true" />
      {r.producto && <p className={styles.ncmDescripcion}>{r.producto}</p>}
      {r.detalle && <p className={styles.referencia}>{r.detalle}</p>}
      {r.dudas && (
        <p className={styles.razonamiento}>
          <Icon name="idea" size={16} />
          Para afinar: {r.dudas}
        </p>
      )}
      {baja && (
        <p className={styles.avisoTexto}>
          No estamos seguros de qué producto es. Revisalo antes de usarlo, o escribilo a mano.
        </p>
      )}
      {pendiente && r.producto && (
        <div className={styles.fotoAcciones}>
          <Button size="sm" onClick={onUsar}>
            {baja
              ? "Usar igual"
              : sobreescribe
                ? "Reemplazar mi descripción"
                : "Usar esta descripción"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDescartar}>
            {sobreescribe ? "Dejar la mía" : "Descartar"}
          </Button>
        </div>
      )}
    </div>
  );
}
