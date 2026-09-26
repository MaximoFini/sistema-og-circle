// VGRP-27 — placeholder visual de una sección de Inicio. Sin datos reales:
// eso lo trae VGRP-29 (grillas) leyendo de las tablas que crea VGRP-38. Acá
// sólo se arma la forma final para que el layout no cambie cuando el
// contenido real llegue.
//
// PUNTO DE EXTENSIÓN — VGRP-30: cada <SeccionSlot> es donde va a montarse el
// componente de bloqueo por nivel (mostrar/ocultar según entitlement). Hoy no
// hay ningún candado acá a propósito: el gating es ese ticket, no este.

import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import styles from "./inicio.module.css";

export interface SeccionSlotProps {
  eyebrow: string;
  titulo: string;
  descripcion: string;
  /** "grid" (skeleton de tarjetas, para secciones tipo directorio/grilla) o
   * "banner" (franja angosta, para accesos directos como la calculadora). */
  variante?: "grid" | "banner";
  /** Cantidad de tiles fantasma a mostrar cuando `variante="grid"` y no se pasa `children`. */
  itemsFantasma?: number;
  proximamente?: boolean;
  /**
   * VGRP-30 — cuando se pasa, reemplaza la grilla fantasma por contenido
   * real (hoy: `<AgentesDemo />`, la demostración del gating). El punto de
   * extensión que VGRP-27 dejó marcado para este ticket.
   */
  children?: ReactNode;
  /**
   * Cuánto ocupa la sección en la grilla bento de Inicio desde 1024px
   * (en mobile siempre es una sola columna). Default: todo el ancho.
   */
  ancho?: "completo" | "amplio" | "mitad";
  /** Ícono del acceso directo (sólo `variante="banner"`). */
  icono?: IconName;
}

const CLASE_ANCHO = {
  completo: styles.anchoCompleto,
  amplio: styles.anchoAmplio,
  mitad: styles.anchoMitad,
} as const;

export function SeccionSlot({
  eyebrow,
  titulo,
  descripcion,
  variante = "grid",
  itemsFantasma = 4,
  proximamente = false,
  children,
  ancho = "completo",
  icono,
}: SeccionSlotProps) {
  const esBanner = variante === "banner";
  const claseVariante = esBanner
    ? proximamente
      ? styles.bannerProximamente
      : styles.banner
    : styles.card;

  return (
    <section className={`${claseVariante} ${CLASE_ANCHO[ancho]}`} aria-label={titulo}>
      {esBanner && icono ? (
        <span className={proximamente ? styles.bannerIconoQuieto : styles.bannerIcono}>
          <Icon name={icono} size={22} />
        </span>
      ) : null}
      <div className={styles.encabezado}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <div className={styles.tituloFila}>
          <h2 className={styles.titulo}>{titulo}</h2>
          {proximamente ? <span className={styles.badge}>Próximamente</span> : null}
        </div>
        <p className={styles.descripcion}>{descripcion}</p>
      </div>

      {children ??
        (variante === "grid" ? (
          <div className={styles.grillaFantasma} aria-hidden="true">
            {Array.from({ length: itemsFantasma }, (_, i) => (
              <div key={i} className={styles.tileFantasma} />
            ))}
          </div>
        ) : null)}
    </section>
  );
}
