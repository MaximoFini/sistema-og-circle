"use client";

// VGRP-57 — ex vegroup@b550803 src/components/QuoteDoc.jsx. Documento de
// cotización imprimible (se convierte en PDF con el diálogo de impresión del
// navegador). Mismo contenido que el original; el estilo es propio
// (QuoteDoc.module.css): invisible en pantalla, y al imprimir es lo único que
// queda, negro sobre blanco y sin vidrio.
//
// Portal directo al <body> con `data-quote-doc`: el documento vive FUERA de la
// app, así al imprimir se oculta todo lo demás y sólo queda esta hoja
// (specs/bloque-12-calculadoras/design-vgrp57.md → "Impresión (PDF)").

import { createPortal } from "react-dom";
import { fmtARS, fmtUSD, LABELS } from "@/lib/cotizador/calc";
import type { GastosDestino, PosicionElegida, Regimen, ResultadoRuta } from "@/lib/cotizador/types";
import styles from "./QuoteDoc.module.css";

const DESTINO_ORDER: (keyof GastosDestino)[] = [
  "flete",
  "tca",
  "cargoFijo",
  "comisionSeguro",
  "handlingDestino",
  "handlingOrigen",
  "volumetrico",
  "derechos",
  "estadistica",
  "impInternos",
  "comisionVegroup",
];

/** El formulario de CotizadorCourier con `cajas` ya normalizado (`{ ...form, cajas }`). */
export interface FormularioQuoteDoc {
  fob: string;
  pesoKg: string;
  unidades: string;
  cajas: number | string;
  largo: string;
  ancho: string;
  alto: string;
  dolarBN: string;
  dolarCCL: string;
}

export interface QuoteDocProps {
  /** N° de cotización (OG-AAAAMMDD-HHMM). */
  refNumber: string;
  /** Fecha ya formateada (es-AR). */
  fecha: string;
  producto: string;
  /** Posición elegida. Sin ella no se renderiza nada, como el original. */
  selected: PosicionElegida | null;
  /** Resultado de la ruta elegida. Sin él no se renderiza nada. */
  result: ResultadoRuta | null;
  form: FormularioQuoteDoc;
  regimen: Regimen;
  /** `links.whatsapp` de la config (VGRP-69): el contacto no se escribe a mano. */
  whatsappContacto: string;
}

export function QuoteDoc({
  refNumber,
  fecha,
  producto,
  selected,
  result,
  form,
  regimen,
  whatsappContacto,
}: QuoteDocProps) {
  if (!result || !selected || typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.hoja} data-quote-doc="">
      <div className={styles.encabezado}>
        <div className={styles.logo}>
          OG <span>CIRCLE</span>
        </div>
        <div className={styles.tituloBloque}>
          <div className={styles.titulo}>COTIZACIÓN DE IMPORTACIÓN</div>
          <div className={styles.meta}>
            N° {refNumber} · {fecha}
          </div>
        </div>
      </div>

      <table className={styles.info}>
        <tbody>
          <tr>
            <th scope="row">Producto</th>
            <td>{producto}</td>
          </tr>
          <tr>
            <th scope="row">Posición arancelaria</th>
            <td>
              <strong>{selected.sim}</strong> — DIE {selected.die}% · TE {selected.te}% · IVA{" "}
              {selected.iva}%
              {/* Sin `impInternos &&` adelante: con 0, React imprimía un "0" suelto (B12-01). */}
              {Number(selected.impInternos) > 0 && ` · II ${selected.impInternos}%`}
              {regimen === "pequeños" && (
                <span className={styles.franquicia}>(Pequeños envíos · franquicia)</span>
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">Depósito de origen</th>
            <td>
              {result.label} ({result.pais}) · tiempo estimado {result.tiempoEstimado}
            </td>
          </tr>
          <tr>
            <th scope="row">Envío</th>
            <td>
              FOB {fmtUSD(Number(form.fob))} · {form.pesoKg} kg · {form.unidades} unidades ·{" "}
              {form.cajas} caja(s) de {form.largo}×{form.ancho}×{form.alto} cm
            </td>
          </tr>
          <tr>
            <th scope="row">Tipo de cambio</th>
            <td>
              BNA {form.dolarBN ? `$${form.dolarBN}` : "—"} (destino)
              {form.dolarCCL && form.dolarCCL !== form.dolarBN
                ? ` · CCL/Cripto $${form.dolarCCL} (proveedor)`
                : ""}
            </td>
          </tr>
        </tbody>
      </table>

      <table className={styles.lineas}>
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col" className={styles.num}>
              USD
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className={styles.ref}>
            <td>{LABELS.cif}</td>
            <td className={styles.num}>{fmtUSD(result.cif)}</td>
          </tr>
          <tr>
            <th scope="rowgroup" colSpan={2} className={styles.grupo}>
              Lo que le pagás a tu proveedor
            </th>
          </tr>
          <tr>
            <td>{LABELS.fob}</td>
            <td className={styles.num}>{fmtUSD(result.fob)}</td>
          </tr>
          <tr>
            <th scope="rowgroup" colSpan={2} className={styles.grupo}>
              Lo que pagás en destino (gastos de importación)
            </th>
          </tr>
          {DESTINO_ORDER.map((k) => (
            <tr key={k}>
              <td>{LABELS[k]}</td>
              <td className={styles.num}>{fmtUSD(result.noRecuperable[k])}</td>
            </tr>
          ))}
          <tr className={styles.subtotal}>
            <td>Subtotal gastos en destino</td>
            <td className={styles.num}>{fmtUSD(result.totalGastosDestino)}</td>
          </tr>
          <tr className={styles.subtotal}>
            <td>Total no recuperable (proveedor + destino)</td>
            <td className={styles.num}>{fmtUSD(result.totalNoRecuperable)}</td>
          </tr>
          <tr>
            <td>{LABELS.iva}</td>
            <td className={styles.num}>{fmtUSD(result.recuperable.iva)}</td>
          </tr>
        </tbody>
      </table>

      <div className={styles.totales}>
        <div className={`${styles.total} ${styles.totalPrincipal}`}>
          <div className={styles.k}>TOTAL A PAGAR (USD)</div>
          <div className={styles.v}>{fmtUSD(result.totalUSD)}</div>
        </div>
        {result.totalPesos != null && (
          <div className={styles.total}>
            <div className={styles.k}>Total en pesos</div>
            <div className={styles.v}>{fmtARS(result.totalPesos)}</div>
            {result.proveedorPesos != null &&
              result.destinoPesos != null &&
              result.dolarCCL !== result.dolarBN && (
                <div className={styles.sub}>
                  Proveedor {fmtARS(result.proveedorPesos)} (CCL ${result.dolarCCL}) · Destino{" "}
                  {fmtARS(result.destinoPesos + (result.ivaPesos || 0))} (BNA ${result.dolarBN})
                </div>
              )}
          </div>
        )}
        <div className={styles.total}>
          <div className={styles.k}>Costo por kg</div>
          <div className={styles.v}>{fmtUSD(result.costoPorKg)}</div>
        </div>
        <div className={styles.total}>
          <div className={styles.k}>Costo por unidad</div>
          <div className={styles.v}>{fmtUSD(result.costoPorUnidad)}</div>
        </div>
      </div>

      <div className={styles.pie}>
        <div>
          <strong>OG Circle</strong> — Logística e importación internacional · Miami · Barcelona ·
          Guangzhou · Buenos Aires
        </div>
        <div>WhatsApp {whatsappContacto}</div>
        <div className={styles.disclaimer}>
          Cotización estimativa válida por 7 días, sujeta a confirmación operativa. El IVA es
          crédito fiscal recuperable para responsables inscriptos.
        </div>
      </div>
    </div>,
    document.body,
  );
}
