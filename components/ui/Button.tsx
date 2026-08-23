// Sin "use client" a propósito: no tiene estado ni hooks propios. Funciona
// como Server Component (por ejemplo un `<Button type="submit">` dentro de un
// form con Server Action) y también dentro de un Client Component que le pase
// handlers.

import type { ComponentPropsWithoutRef } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "aria-busy"> {
  /**
   * `primary` — CTA ámbar en gradiente (DESIGN.md §3, `.btn-gradient`).
   * `ghost` — vidrio, para acciones secundarias (`.liquid-glass`).
   */
  variant?: "primary" | "ghost";
  /**
   * Estado de carga: deshabilita el botón, marca `aria-busy` y muestra el
   * spinner. El label se mantiene visible para que el botón no cambie de
   * ancho ni el lector de pantalla pierda el contexto.
   */
  loading?: boolean;
  /** Ocupa todo el ancho disponible. Default en formularios de mobile. */
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...buttonProps
}: ButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={[
        styles.button,
        styles[variant],
        fullWidth ? styles.fullWidth : null,
        loading ? styles.loading : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
