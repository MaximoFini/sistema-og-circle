// Sin "use client": puramente presentacional. `bloqueado` llega ya
// calculado por el caller (con `tieneAcceso()` de lib/auth/claims.ts) — así
// este componente sirve igual desde un Server Component o un Client
// Component, sin duplicar el cálculo de entitlement en dos lugares.

import NextLink from "next/link";
import type { ReactNode } from "react";
import buttonStyles from "./Button.module.css";
import styles from "./ContenidoBloqueado.module.css";
import { Icon } from "./Icon";

export interface ContenidoBloqueadoProps {
  bloqueado: boolean;
  children: ReactNode;
}

/**
 * VGRP-30 — nunca oculta una sección sin explicación (PRD §6): si está
 * bloqueada, muestra un mensaje y un CTA — nunca la esconde ni la reemplaza
 * por un vacío sin contexto.
 *
 * VGRP-59/60 (Bloque 13 — plan único): con un solo plan el gating es
 * todo-o-nada — ya no hay un "nivel requerido" por fila que mostrar, ni un
 * CTA de "mejorar de nivel" (no hay a qué nivel más alto mejorar). Antes
 * este componente recibía `nivelRequerido`/`nivelActual` para armar ese
 * mensaje; con un solo plan, `bloqueado` ya alcanza: si está bloqueado, es
 * porque el usuario todavía no compró el plan completo.
 */
export function ContenidoBloqueado({ bloqueado, children }: ContenidoBloqueadoProps) {
  if (!bloqueado) return children;

  // Mismo criterio que app/(app)/dashboard/page.tsx (VGRP-22): el CTA es un
  // <NextLink> con las clases de Button, nunca un <button> anidado dentro
  // del <a> (HTML inválido, contenido interactivo anidado).
  return (
    <div className={styles.bloqueado}>
      <p className={styles.mensaje}>
        <Icon name="candado" size={16} className={styles.candado} />
        <span>Disponible con el plan completo.</span>
      </p>
      <NextLink
        href="/comprar"
        className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.small}`}
      >
        Comprar acceso
      </NextLink>
    </div>
  );
}
