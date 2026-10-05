// Sin "use client": puramente presentacional, se renderiza dentro de rutas
// ESTÁTICAS (`/dashboard/ninguno`, `/calculadora/ninguno`) — no lee sesión.

import NextLink from "next/link";
import type { ReactNode } from "react";
import { formatearPrecio } from "@/lib/format";
import buttonStyles from "./Button.module.css";
import { Icon } from "./Icon";
import styles from "./TarjetaDesbloqueo.module.css";

export interface TarjetaDesbloqueoProps {
  nombrePlan: string;
  /** `null` si el precio no se pudo leer (fail-closed): no se muestra ningún número. */
  precio: number | null;
  /** La pantalla real, que queda de fondo: borrosa e inerte. */
  children: ReactNode;
}

/**
 * VGRP-77 — la plataforma real de fondo, borrosa y sin poder usarse, con una
 * tarjeta fija encima que lleva a `/comprar`.
 *
 * El blur es SÓLO presentación: lo que está en `children` llega igual al
 * navegador. Quien use este componente no le pasa nada que un usuario sin
 * plan no pueda ver (p. ej. `InicioShell bloqueado` saca los `embedUrl`).
 *
 * `inert` saca el fondo del foco y de los clicks; `aria-hidden` lo saca del
 * árbol de accesibilidad, así que el título de la tarjeta es el `h1` de la
 * página. El fondo sigue en el flujo normal, así que la página scrollea.
 */
export function TarjetaDesbloqueo({ nombrePlan, precio, children }: TarjetaDesbloqueoProps) {
  return (
    <div className={styles.contenedor}>
      <div className={styles.fondo} inert aria-hidden="true">
        {children}
      </div>

      <section className={styles.tarjeta} aria-labelledby="tarjeta-desbloqueo-titulo">
        <span className={styles.icono}>
          <Icon name="candado" size={24} />
        </span>
        <p className={styles.eyebrow}>{nombrePlan}</p>
        <h1 id="tarjeta-desbloqueo-titulo" className={styles.titulo}>
          Desbloqueá OG Circle
        </h1>
        <p className={styles.bajada}>
          La formación completa, la calculadora de costos y la red de agentes y profesionales del
          círculo.
        </p>
        {precio !== null ? (
          <p className={styles.precio}>
            {formatearPrecio.format(precio)}
            <span>pago único</span>
          </p>
        ) : null}
        {/* Mismo criterio que ContenidoBloqueado: NextLink con las clases de
            Button, nunca un <button> anidado dentro de un <a>. */}
        <NextLink
          href="/comprar"
          className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.fullWidth}`}
        >
          Comprar acceso
        </NextLink>
      </section>
    </div>
  );
}
