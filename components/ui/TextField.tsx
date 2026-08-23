"use client";

// Cliente porque usa `useId()` (hook) para generar los ids que enlazan
// `<label for>`, el input y sus mensajes. Los cuatro formularios del Bloque 2
// (login, registro, recuperar, nueva contraseña) son client components de
// todos modos.

import type { ComponentPropsWithoutRef } from "react";
import { useId } from "react";
import styles from "./TextField.module.css";

export interface TextFieldProps
  extends Omit<ComponentPropsWithoutRef<"input">, "aria-invalid" | "aria-describedby"> {
  /** Texto del `<label>`. Obligatorio: no hay campo sin label en este sistema. */
  label: string;
  /** Mensaje de error del campo. Si viene, el input queda `aria-invalid`. */
  error?: string | null;
  /** Ayuda opcional bajo el campo (formato esperado, requisitos, etc.). */
  hint?: string;
}

/**
 * Campo de texto con label, ayuda opcional y estado de error.
 *
 * Accesibilidad (no negociable, ver el brief del Bloque 2):
 * - `<label htmlFor>` siempre asociado al input.
 * - `aria-invalid="true"` cuando hay `error`.
 * - `aria-describedby` apunta a la ayuda y/o al mensaje de error.
 * - El error se anuncia con `role="alert"`.
 * - Foco visible propio (`:focus-visible`), nunca `outline: none` a secas.
 */
export function TextField({ label, error, hint, className, ...inputProps }: TextFieldProps) {
  // Los tres ids derivan del MISMO base: si el caller pasa un `id` propio,
  // la ayuda y el error cuelgan de ese id, no del generado. Derivarlos por
  // separado haría que dos campos con el mismo `id` explícito terminaran
  // apuntando al mensaje del otro.
  const autoId = useId();
  const inputId = inputProps.id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <input
        {...inputProps}
        id={inputId}
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
