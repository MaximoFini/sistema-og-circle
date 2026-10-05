// Sin "use client": puramente presentacional, se renderiza dentro de rutas
// ESTÁTICAS (`/dashboard/ninguno`, `/calculadora/ninguno`) — no lee sesión.

import NextLink from "next/link";
import type { ReactNode } from "react";
import { formatearPrecio } from "@/lib/format";
import buttonStyles from "./Button.module.css";
import { Icon, type IconName } from "./Icon";
import styles from "./TarjetaDesbloqueo.module.css";

export interface TarjetaDesbloqueoProps {
  nombrePlan: string;
  /** `null` si el precio no se pudo leer (fail-closed): no se muestra ningún número. */
  precio: number | null;
  /** La pantalla real, que queda de fondo: borrosa e inerte. */
  children: ReactNode;
}

interface Beneficio {
  icono: IconName;
  texto: string;
  /** Todavía no está en la plataforma: se muestra con "Pronto". */
  pronto?: boolean;
  /** Partner que respalda el beneficio. */
  partner?: "belo";
}

// Lo que incluye el plan, en el mismo orden que la grilla "OG Circle: lo que
// ponemos a tu disposición" de la landing (OGCircleFeatures). Lo que la
// plataforma todavía no tiene va marcado "Pronto", igual que en el menú.
const BENEFICIOS: Beneficio[] = [
  { icono: "play", texto: "11 videos, paso a paso" },
  { icono: "calculadora", texto: "Calculadora con el dólar del día" },
  { icono: "ubicacion", texto: "Depósitos en China, Miami y España" },
  { icono: "mensaje", texto: "6 agentes verificados en China" },
  { icono: "documento", texto: "Despachantes y contadores" },
  { icono: "escudo", texto: "Pagos al exterior", partner: "belo" },
  { icono: "tracking", texto: "Tracking de tu carga", pronto: true },
  { icono: "comunidad", texto: "Grupo de importadores", pronto: true },
];

/**
 * VGRP-77 — la plataforma real de fondo, borrosa y sin poder usarse, con una
 * tarjeta fija encima que cuenta todo lo que incluye el plan y lleva a
 * `/comprar`.
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
          <Icon name="candado" size={22} />
        </span>
        <p className={styles.eyebrow}>{nombrePlan}</p>
        <h1 id="tarjeta-desbloqueo-titulo" className={styles.titulo}>
          Desbloqueá OG Circle
        </h1>
        <p className={styles.bajada}>Todo lo que necesitás para importar, en un solo lugar.</p>

        <ul className={styles.beneficios} aria-label="Qué incluye">
          {BENEFICIOS.map((b) => (
            // El ícono es único por beneficio y no cambia aunque se edite el copy.
            <li key={b.icono} className={styles.beneficio}>
              <span className={styles.beneficioIcono} aria-hidden="true">
                <Icon name={b.icono} size={15} />
              </span>
              <span className={styles.beneficioTexto}>{b.texto}</span>
              {b.partner === "belo" ? (
                <span className={styles.partner}>
                  <span className={styles.partnerCon}>con</span>
                  {/* <img> nativo y no next/image: este componente sale del
                      barril `@/components/ui`, y el cliente de next/image se
                      sumaba (~6 kB) a todas las rutas que importan de ahí. Un
                      logo de 34×18 servido desde public/ no lo necesita. */}
                  <img
                    src="/partner-belo.webp"
                    alt="Belo"
                    width={34}
                    height={18}
                    loading="lazy"
                    decoding="async"
                    className={styles.partnerLogo}
                  />
                </span>
              ) : null}
              {b.pronto ? <span className={styles.pronto}>Pronto</span> : null}
            </li>
          ))}
        </ul>

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
