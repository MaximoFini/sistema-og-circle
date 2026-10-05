import type { ReactNode } from "react";
import { TextLink } from "@/components/ui";
import { TERMINOS_VERSION } from "@/lib/legal/version";
import styles from "./legal.module.css";

export interface LegalDocPageProps {
  title: string;
  /**
   * Párrafo extra dentro del callout de placeholder, además del aviso
   * estándar. Lo usa `/reembolsos` para aclarar que, a diferencia de las
   * otras dos páginas, ese texto no es libre — tiene que coincidir con lo
   * que el sistema hace de verdad.
   */
  placeholderExtra?: ReactNode;
  /**
   * `false` cuando el documento ya tiene su texto publicado y no lleva el
   * aviso de placeholder (VGRP-78: Privacidad, requisito de Google OAuth).
   */
  placeholder?: boolean;
  /** Contenido de `.prose`: los `<h2>`/`<p>` propios de cada documento. */
  children: ReactNode;
}

/**
 * Chrome compartido por las tres páginas de documento (`/terminos`,
 * `/privacidad`, `/reembolsos`): el link de vuelta, el título con la versión
 * vigente, y el callout que marca el contenido como placeholder. VGRP-34 — no
 * lo usa `/legales` (el índice), que no es un documento sino la lista de los
 * tres.
 */
export function LegalDocPage({
  title,
  placeholderExtra,
  placeholder = true,
  children,
}: LegalDocPageProps) {
  return (
    <>
      <TextLink href="/legales">← Volver a legales</TextLink>

      <div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updated}>Versión: {TERMINOS_VERSION}</p>
      </div>

      {placeholder ? (
        <div className={styles.placeholder}>
          <p>
            <strong>Placeholder.</strong> Esta página está maquetada con la estructura que va a
            tener el texto legal, pero el contenido todavía no es el definitivo. El texto real lo
            entrega Jota — hasta que llegue, no se puede lanzar la plataforma (PRD Fase 2 §8).
          </p>
          {placeholderExtra}
        </div>
      ) : null}

      <div className={styles.prose}>{children}</div>
    </>
  );
}
