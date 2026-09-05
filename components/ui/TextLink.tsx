// Sin "use client": es un `<a>`/`<Link>` puramente presentacional, sin
// estado ni hooks propios.

import NextLink from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./TextLink.module.css";

export type TextLinkProps = ComponentPropsWithoutRef<typeof NextLink>;

/**
 * Link de texto mudo y subrayado — variante de menor jerarquía que un link
 * de contenido normal. Usado hoy en el footer de `(app)` y en el "← Volver a
 * legales" de `(legal)`: mismo estilo exacto en los dos casos (VGRP-34), así
 * que vive acá en vez de repetirse en cada CSS Module de layout.
 */
export function TextLink({ className, ...linkProps }: TextLinkProps) {
  return <NextLink {...linkProps} className={[styles.link, className].filter(Boolean).join(" ")} />;
}
