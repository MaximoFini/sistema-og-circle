"use client";

// VGRP-58 — único componente de "cableado" nuevo: el toggle courier/marítimo
// que vive arriba de todo en /calculadora (decisión del equipo, 2026-09-28:
// un solo entry point, sin ruta ni menú propios para el marítimo — ver
// specs/bloque-12-calculadoras/design-vgrp58.md → "Architecture").
//
// `CotizadorCourier` se importa estático: es el comportamiento por defecto y
// ya paga el presupuesto de /calculadora hoy (B12-14, 200 kB exactos).
// `CotizadorMaritimo` se importa con next/dynamic, recién cuando el usuario
// elige "Marítimo" — si se importara estático rompería el presupuesto con
// certeza (~3.000 líneas más de UI y motor). Ver design-vgrp58.md →
// "Rendimiento y presupuesto de bundle".
//
// Al cambiar de opción, el formulario del otro modo se desmonta (React lo
// hace solo al dejar de renderizarlo): nada se persiste, mismo criterio que
// el original.

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { CotizadorCourier } from "./CotizadorCourier";
import styles from "./cotizador.module.css";

const CotizadorMaritimo = dynamic(
  () => import("./CotizadorMaritimo").then((m) => m.CotizadorMaritimo),
  {
    ssr: false,
    loading: () => (
      <div className={styles.panelCargando} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.avisoTexto}>Cargando el cotizador marítimo…</span>
      </div>
    ),
  },
);

type Modo = "courier" | "maritimo";

const OPCIONES_MODO: readonly { id: Modo; titulo: string; desc: string }[] = [
  { id: "courier", titulo: "Courier", desc: "Aéreo · por kg · IA para NCM" },
  { id: "maritimo", titulo: "Marítimo", desc: "Consolidado y contenedor completo · por TN/m³" },
];

/**
 * `bloqueado` (VGRP-77): fondo inerte de la calculadora sin plan; ver CotizadorCourier.
 * `whatsappContacto` (VGRP-69): `links.whatsapp` de la config, para el pie del
 * PDF y de los mensajes de WhatsApp.
 */
export function CotizadorSelector({
  bloqueado = false,
  whatsappContacto,
}: {
  bloqueado?: boolean;
  whatsappContacto: string;
}) {
  const [modo, setModo] = useState<Modo>("courier");
  const id = useId();

  return (
    <div className={styles.cotizador}>
      <fieldset className={styles.grupoOpciones}>
        <legend className={styles.srOnly}>Tipo de cotización</legend>
        {OPCIONES_MODO.map((op) => (
          <label
            key={op.id}
            className={
              modo === op.id ? `${styles.regimen} ${styles.regimenElegido}` : styles.regimen
            }
          >
            <input
              type="radio"
              name={`${id}-modo`}
              value={op.id}
              checked={modo === op.id}
              onChange={() => setModo(op.id)}
              className={styles.radio}
            />
            <span className={styles.opcionTexto}>
              <span className={styles.opcionTitulo}>{op.titulo}</span>
              <span className={styles.opcionDesc}>{op.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {modo === "courier" ? (
        <CotizadorCourier bloqueado={bloqueado} whatsappContacto={whatsappContacto} />
      ) : (
        <CotizadorMaritimo whatsappContacto={whatsappContacto} />
      )}
    </div>
  );
}
