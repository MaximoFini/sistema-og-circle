"use client";

// Mismo motivo que TextField: `useId()` es un hook, así que este componente
// necesita ser cliente. Los formularios que lo usan ya son Client Components.

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useId } from "react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps
  extends Omit<ComponentPropsWithoutRef<"input">, "type" | "aria-invalid" | "aria-describedby"> {
  /**
   * Contenido del label. Acepta `ReactNode` (no sólo `string`, a diferencia
   * de `TextField`) porque el primer uso — aceptar Términos y Privacidad —
   * necesita links inline dentro del texto.
   */
  label: ReactNode;
  /** Mensaje de error. Si viene, queda `aria-invalid` y se anuncia con `role="alert"`. */
  error?: string | null;
}

/**
 * Checkbox con label asociado y estado de error, mismo criterio de
 * accesibilidad que `TextField`: `<label htmlFor>`, `aria-invalid`,
 * `aria-describedby` hacia el mensaje de error, foco visible propio.
 */
export function Checkbox({ label, error, className, ...inputProps }: CheckboxProps) {
  const autoId = useId();
  const inputId = inputProps.id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className={styles.field}>
      <div className={styles.row}>
        <input
          {...inputProps}
          type="checkbox"
          id={inputId}
          className={[styles.checkbox, className].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      </div>

      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
