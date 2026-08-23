// Sin "use client": es puramente presentacional.

import type { ReactNode } from "react";
import styles from "./FormError.module.css";

export interface FormErrorProps {
  /**
   * Mensaje de error a nivel formulario (credenciales inválidas, rate limit,
   * caída del backend). Si es falsy no se renderiza nada — el caller no
   * necesita condicionar afuera.
   */
  children?: ReactNode;
  /** Para enlazarlo desde un `aria-describedby` si el caller lo necesita. */
  id?: string;
}

/**
 * Error a nivel formulario (no de un campo puntual: para eso está la prop
 * `error` de `TextField`).
 *
 * `role="alert"` para que un lector de pantalla lo anuncie apenas aparece,
 * sin que el usuario tenga que ir a buscarlo.
 */
export function FormError({ children, id }: FormErrorProps) {
  if (!children) return null;

  return (
    <p className={styles.formError} id={id} role="alert">
      {children}
    </p>
  );
}
