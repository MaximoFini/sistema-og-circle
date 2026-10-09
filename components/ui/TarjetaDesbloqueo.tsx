// Sin "use client": puramente presentacional, se renderiza dentro de rutas
// ESTÁTICAS (`/dashboard/ninguno`, `/calculadora/ninguno`) — no lee sesión.

import type { ReactNode } from "react";
import { formatearPrecio } from "@/lib/format";
import { Icon, type IconName } from "./Icon";
import styles from "./TarjetaDesbloqueo.module.css";

export interface TarjetaDesbloqueoProps {
  nombrePlan: string;
  /** `null` si el precio no se pudo leer (fail-closed): no se muestra ningún número. */
  precio: number | null;
  /**
   * El CTA de compra. Lo pone quien usa la tarjeta (VGRP-78: el botón que
   * cobra directo, `ComprarButton`), así `components/ui` no depende de `app/`.
   */
  accion: ReactNode;
  /** La pantalla real, que queda de fondo: borrosa e inerte. */
  children: ReactNode;
}

// Logos de quien opera cada beneficio, servidos desde public/ (raíz: el
// matcher de middleware.ts sólo excluye imágenes de un segmento). `alto` es
// el tamaño pintado; `fondoClaro`, si el logo necesita la pastilla blanca
// para leerse sobre la tarjeta oscura (como en los partners de la landing).
const PARTNERS = {
  vegroup: { src: "/partner-vegroup.webp", alt: "VeGroup", ancho: 41, alto: 22, fondoClaro: false },
  belo: { src: "/partner-belo.webp", alt: "Belo", ancho: 34, alto: 18, fondoClaro: true },
  traxcargo: {
    src: "/partner-traxcargo.webp",
    alt: "Traxcargo",
    ancho: 47,
    alto: 17,
    fondoClaro: true,
  },
} as const;

interface Beneficio {
  /** Único por beneficio: también es la `key` de la fila. */
  icono: IconName;
  texto: string;
  /** Todavía no está en la plataforma: se muestra con "Pronto". */
  pronto?: boolean;
  /** Quién lo opera: se muestra su logo ("con …"). */
  partner?: keyof typeof PARTNERS;
}

// Lo que incluye el plan, en el mismo orden que la grilla "OG Circle: lo que
// ponemos a tu disposición" de la landing (OGCircleFeatures). Lo que la
// plataforma todavía no tiene va marcado "Pronto", igual que en el menú.
const BENEFICIOS: Beneficio[] = [
  { icono: "play", texto: "Formación en video, paso a paso" },
  { icono: "calculadora", texto: "Calculadora comercial" },
  { icono: "barco", texto: "Calculadora marítima" },
  { icono: "ubicacion", texto: "Depósitos en China, Miami y España", partner: "vegroup" },
  { icono: "mensaje", texto: "6 agentes verificados en China" },
  { icono: "perfil", texto: "Despachantes y contadores" },
  { icono: "escudo", texto: "Pagos al exterior", partner: "belo" },
  { icono: "tracking", texto: "Tracking de tu carga", partner: "traxcargo", pronto: true },
  { icono: "comunidad", texto: "Grupo de importadores", pronto: true },
];

function LogoPartner({ partner }: { partner: keyof typeof PARTNERS }) {
  const { src, alt, ancho, alto, fondoClaro } = PARTNERS[partner];
  return (
    <span className={styles.partner}>
      <span className={styles.partnerCon}>con</span>
      {/* <img> nativo y no next/image: este componente sale del barril
          `@/components/ui`, y el cliente de next/image se sumaba (~6 kB) a
          todas las rutas que importan de ahí. Logos chicos de public/ no lo
          necesitan. */}
      <span className={fondoClaro ? styles.pastillaClara : styles.pastilla}>
        <img src={src} alt={alt} width={ancho} height={alto} loading="lazy" decoding="async" />
      </span>
    </span>
  );
}

/**
 * VGRP-77 — la plataforma real de fondo, borrosa y sin poder usarse, con una
 * tarjeta fija encima que cuenta todo lo que incluye el plan y cobra desde
 * ahí mismo (`accion`).
 *
 * El blur es SÓLO presentación: lo que está en `children` llega igual al
 * navegador. Quien use este componente no le pasa nada que un usuario sin
 * plan no pueda ver (p. ej. `InicioShell bloqueado` saca los `embedUrl`).
 *
 * `inert` saca el fondo del foco y de los clicks; `aria-hidden` lo saca del
 * árbol de accesibilidad, así que el título de la tarjeta es el `h1` de la
 * página. El fondo sigue en el flujo normal, así que la página scrollea.
 */
export function TarjetaDesbloqueo({
  nombrePlan,
  precio,
  accion,
  children,
}: TarjetaDesbloqueoProps) {
  return (
    <div className={styles.contenedor}>
      <div className={styles.fondo} inert aria-hidden="true">
        {children}
      </div>

      <section className={styles.tarjeta} aria-labelledby="tarjeta-desbloqueo-titulo">
        <div className={styles.cuerpo}>
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
                {b.partner ? <LogoPartner partner={b.partner} /> : null}
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
          {accion}
        </div>
      </section>
    </div>
  );
}
