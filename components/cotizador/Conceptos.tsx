// VGRP-69 — "¿Qué significa cada concepto?": glosario corto de los términos
// del resultado que un importador nuevo no conoce. Un <details> nativo: se
// abre con teclado (Enter/Espacio sobre el <summary>) y el lector de pantalla
// anuncia si está abierto, sin componente nuevo ni JS propio.
//
// Sólo lo usan RouteBreakdown y MaritimoResultado, que ya se cargan en
// diferido: no suma peso a la carga inicial de /calculadora.

import styles from "./cotizador.module.css";

const GLOSARIO = {
  cif: [
    "CIF",
    "Mercadería + flete + seguro. Es la base sobre la que se calculan los impuestos de la aduana.",
  ],
  die: [
    "DIE (derechos de importación)",
    "El arancel que cobra la aduana. El porcentaje depende de la posición arancelaria.",
  ],
  te: [
    "TE (tasa de estadística)",
    "Un porcentaje chico que se suma a los derechos. También sale de la posición arancelaria.",
  ],
  recuperable: [
    "IVA y percepciones recuperables",
    "Se pagan en el despacho, pero si sos responsable inscripto los descontás después. Por eso no entran en el costo real.",
  ],
  volumetrico: [
    "Peso volumétrico",
    "Lo que pesaría la caja según cuánto lugar ocupa. Si es mayor que el peso real, se cobra ese.",
  ],
  tnm3: [
    "TN/m³",
    "En barco se paga por tonelada o por metro cúbico, lo que sea mayor. Ej: 8 m³ y 2 toneladas se cobran como 8.",
  ],
  consolidado: [
    "Consolidado (LCL) y full (FCL)",
    "Consolidado: tu carga comparte contenedor con otras y pagás por lo que ocupa. Full: un contenedor entero para vos.",
  ],
} as const;

export type Concepto = keyof typeof GLOSARIO;

export function Conceptos({ terminos }: { terminos: readonly Concepto[] }) {
  return (
    <details className={styles.conceptos}>
      <summary className={styles.conceptosResumen}>¿Qué significa cada concepto?</summary>
      <dl className={styles.conceptosLista}>
        {terminos.map((t) => {
          const [termino, definicion] = GLOSARIO[t];
          return (
            <div key={t}>
              <dt className={styles.conceptosTermino}>{termino}</dt>
              <dd className={styles.conceptosDefinicion}>{definicion}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
