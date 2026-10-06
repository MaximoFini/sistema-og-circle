import type { ReactNode } from "react";
import { TextLink } from "@/components/ui";
import { TERMINOS_VERSION } from "@/lib/legal/version";
import styles from "./legal.module.css";

export interface LegalDocPageProps {
  title: string;
  /** Contenido de `.prose`: los `<h2>`/`<p>` propios de cada documento. */
  children: ReactNode;
}

/**
 * Chrome compartido por las tres páginas de documento (`/terminos`,
 * `/privacidad`, `/reembolsos`): el link de vuelta y el título con la versión
 * vigente. VGRP-34 — no lo usa `/legales` (el índice), que no es un documento
 * sino la lista de los tres.
 */
export function LegalDocPage({ title, children }: LegalDocPageProps) {
  return (
    <>
      <TextLink href="/legales">← Volver a legales</TextLink>

      <div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updated}>Versión: {TERMINOS_VERSION}</p>
      </div>

      <div className={styles.prose}>{children}</div>
    </>
  );
}
