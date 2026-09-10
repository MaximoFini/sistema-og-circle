// Sin "use client": puramente presentacional. `bloqueado` llega ya
// calculado por el caller (con `hasNivel()` de lib/auth/claims.ts) — así
// este componente sirve igual desde un Server Component o un Client
// Component, sin duplicar el cálculo de entitlement en dos lugares.

import NextLink from "next/link";
import type { ReactNode } from "react";
import type { NivelAcceso } from "@/lib/auth/claims";
import buttonStyles from "./Button.module.css";
import styles from "./ContenidoBloqueado.module.css";

const ETIQUETA_NIVEL: Record<NivelAcceso, string> = {
  ninguno: "ningún nivel",
  principiante: "Principiante",
  avanzado: "Avanzado",
};

export interface ContenidoBloqueadoProps {
  bloqueado: boolean;
  nivelRequerido: NivelAcceso;
  /** 'ninguno' → CTA de compra; cualquier otro → CTA de upgrade. */
  nivelActual: NivelAcceso;
  children: ReactNode;
}

/**
 * VGRP-30 — nunca oculta una sección sin explicación (PRD §6): si está
 * bloqueada, muestra qué nivel la desbloquea y un CTA — nunca la esconde ni
 * la reemplaza por un vacío sin contexto.
 */
export function ContenidoBloqueado({
  bloqueado,
  nivelRequerido,
  nivelActual,
  children,
}: ContenidoBloqueadoProps) {
  if (!bloqueado) return children;

  // Mismo criterio que app/(app)/dashboard/page.tsx (VGRP-22): el CTA es un
  // <NextLink> con las clases de Button, nunca un <button> anidado dentro
  // del <a> (HTML inválido, contenido interactivo anidado).
  return (
    <div className={styles.bloqueado}>
      <p className={styles.mensaje}>
        Disponible desde nivel <strong>{ETIQUETA_NIVEL[nivelRequerido]}</strong>.
      </p>
      <NextLink href="/comprar" className={`${buttonStyles.button} ${buttonStyles.primary}`}>
        {nivelActual === "ninguno" ? "Comprar acceso" : "Mejorar mi nivel"}
      </NextLink>
    </div>
  );
}
