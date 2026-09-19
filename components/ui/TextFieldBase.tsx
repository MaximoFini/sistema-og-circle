// VGRP-56 punto 3 — el render de TextField, sin `useId()`: la única razón por
// la que TextField.tsx es "use client" es ese hook, para generar un id cuando
// el caller no pasa uno. Server Components que SÍ pueden dar un id fijo y
// estable (los 3 listados de admin — UsuariosFiltros/PagosFiltros/
// AuditoriaFiltros, un campo por form, sin duplicados) usan este componente
// directo y quedan 100% HTML, sin frontera de cliente ni hidratación.
//
// Sin hooks, sin "use client": TextField.tsx (cliente, con el fallback de
// useId()) lo envuelve para los forms que sí necesitan un id automático.
// Mismo markup exacto en los dos casos — esto es de dónde sale el id, no de
// qué sale.

import type { ComponentPropsWithoutRef } from "react";
import styles from "./TextField.module.css";

export interface TextFieldBaseProps
  extends Omit<ComponentPropsWithoutRef<"input">, "aria-invalid" | "aria-describedby" | "id"> {
  id: string;
  /** Texto del `<label>`. Obligatorio: no hay campo sin label en este sistema. */
  label: string;
  /** Mensaje de error del campo. Si viene, el input queda `aria-invalid`. */
  error?: string | null;
  /** Ayuda opcional bajo el campo (formato esperado, requisitos, etc.). */
  hint?: string;
}

export function TextFieldBase({
  id,
  label,
  error,
  hint,
  className,
  ...inputProps
}: TextFieldBaseProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>

      <input
        {...inputProps}
        id={id}
        className={[styles.input, error ? styles.inputError : null, className]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />

      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
