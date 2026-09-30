"use client";

// VGRP-58 — ex vegroup@b550803 src/components/MaritimoQuoteDoc.jsx.
// Documento de cotización marítima imprimible (se convierte en PDF con el
// diálogo de impresión del navegador). Mismo contenido que el original —
// desglose completo del consolidado y, al pie, la comparación contra el
// full. El estilo es propio (MaritimoQuoteDoc.module.css): invisible en
// pantalla, y al imprimir es lo único que queda — mismo mecanismo que
// QuoteDoc de VGRP-57 (createPortal a document.body + @media print con
// `:has()`, ver QuoteDoc.module.css para por qué esa forma exacta del
// selector).
//
// La marca VEGROUP en el encabezado se porta igual que está — misma
// decisión pendiente que B12-07 en bugs.md, hasta que el equipo decida sobre
// las dos hojas juntas (courier + marítimo).

import { createPortal } from "react-dom";
import {
  fmtARS,
  fmtNum,
  fmtPct,
  fmtUSD,
  PUERTO_DESCARGA,
  type Puerto,
} from "@/lib/cotizador/tarifasMaritimo";
import type { FiscalMaritimo, ResultadoAmbas } from "@/lib/cotizador/types";
import styles from "./MaritimoQuoteDoc.module.css";
import { notaFlete } from "./notaFlete";

export interface DatosMaritimoQuoteDoc {
  producto: string;
  proveedor: string;
  direccion: string;
  puerto: Puerto | undefined;
  fiscal: FiscalMaritimo;
  unidades: number;
}

export interface MaritimoQuoteDocProps {
  refNumber: string;
  fecha: string;
  datos: DatosMaritimoQuoteDoc;
  res: ResultadoAmbas | null;
}

export function MaritimoQuoteDoc({ refNumber, fecha, datos, res }: MaritimoQuoteDocProps) {
  if (!res || typeof document === "undefined") return null;
  const { consolidado: c, full, contenedor, fullEsEstimado } = res;
  const { despacho: d, operativos: op, totales: t, medidas: m, tc } = c;
  const { fiscal, puerto } = datos;

  return createPortal(
    <div className={styles.hoja} data-maritimo-quote-doc="">
      <div className={styles.encabezado}>
        <div className={styles.logo}>
          VE<span>GROUP</span>
        </div>
        <div className={styles.tituloBloque}>
          <div className={styles.titulo}>COSTO DE IMPORTACIÓN</div>
          <div className={styles.meta}>
            Vía marítima · N° {refNumber} · {fecha}
          </div>
        </div>
      </div>

      <table className={styles.info}>
        <tbody>
          <tr>
            <th scope="row">Mercadería</th>
            <td>{datos.producto || "—"}</td>
            <th scope="row">Posición SIM</th>
            <td>
              {fiscal.sim ? (
                <>
                  <strong>{fiscal.sim}</strong> — DIE {fmtNum(fiscal.die, 2)}% · TE{" "}
                  {fmtNum(fiscal.te, 2)}% · IVA {fmtNum(fiscal.iva, 2)}%
                </>
              ) : (
                "—"
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">Proveedor</th>
            <td>{datos.proveedor || "—"}</td>
            <th scope="row">Puerto de carga</th>
            <td>
              {puerto ? `${puerto.label} (${puerto.pais})` : "—"} → {PUERTO_DESCARGA.label} (
              {PUERTO_DESCARGA.pais})
            </td>
          </tr>
          <tr>
            <th scope="row">Volumen</th>
            <td>{fmtNum(m.m3, 3)} m³</td>
            <th scope="row">Peso</th>
            <td>{fmtNum(m.kg, 0)} kg</td>
          </tr>
          <tr>
            <th scope="row">TN/m³ facturable</th>
            <td>
              {fmtNum(m.wm, 3)}{" "}
              <span className={styles.gris}>
                ({m.porVolumen ? "manda el volumen" : "manda el peso"})
              </span>
            </td>
            <th scope="row">Tránsito estimado</th>
            <td>{puerto ? `${puerto.transito} días` : "—"}</td>
          </tr>
        </tbody>
      </table>

      {/* ── Despacho ─────────────────────────────────────────────────── */}
      <table className={styles.lineas}>
        <thead>
          <tr>
            <th>Despacho de importación</th>
            <th className={styles.pct}>Alícuota</th>
            <th className={styles.num}>Monto USD</th>
            <th className={styles.num}>Monto $</th>
          </tr>
        </thead>
        <tbody>
          <F l="Valor FOB" n="Mercadería" v={d.fob} tc={tc} />
          <F
            l="Flete internacional"
            n={`${fmtPct(c.fleteDeclaradoPct, 0)} del pagado`}
            v={d.flete}
            tc={tc}
          />
          <F l="Seguro" n="1% s/FOB + flete" v={d.seguro} tc={tc} />
          <F l="Valor CIF — base imponible" v={d.cif} tc={tc} sub />
          <F l="Derechos" p={d.pct.derechos} v={d.derechos} tc={tc} />
          <F l="Estadística" p={d.pct.estadistica} v={d.estadistica} tc={tc} />
          <F l="Base IVA" v={d.baseIva} tc={tc} sub />
          <F l="I.V.A." p={d.pct.iva} v={d.iva} tc={tc} />
          <F l="I.V.A. adicional" p={d.pct.ivaAdicional} v={d.ivaAdicional} tc={tc} />
          <F l="Ganancias" p={d.pct.ganancias} v={d.ganancias} tc={tc} />
          <F l="Ingresos brutos" p={d.pct.iibb} v={d.iibb} tc={tc} />
          <F l="Arancel SIM" v={d.arancelSim} tc={tc} />
          <F l="Total gravámenes" v={d.totalGravamenes} tc={tc} sub />
        </tbody>
      </table>

      {/* ── Gastos operativos ────────────────────────────────────────── */}
      <table className={styles.lineas} style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>Gastos operativos</th>
            <th className={styles.pct} />
            <th className={styles.num}>Monto USD</th>
            <th className={styles.num}>Monto $</th>
          </tr>
        </thead>
        <tbody>
          {op.lineas.map((l) => (
            <F
              key={l.key}
              l={l.label}
              n={l.key === "flete" ? notaFlete(c.fleteEsOverride, m.wm, true) : undefined}
              v={l.usd}
              tc={tc}
            />
          ))}
          <F l={`I.V.A. ${op.ivaPct}%`} n="ítem único · factura A" v={op.ivaGastos} tc={tc} />
          <F l="Total gastos operativos" v={op.total} tc={tc} sub />
        </tbody>
      </table>

      {/* ── Totales ──────────────────────────────────────────────────── */}
      <div className={styles.totales}>
        <div className={`${styles.total} ${styles.totalPrincipal}`}>
          <div className={styles.k}>Total costos (sin IVA)</div>
          <div className={styles.v}>{fmtUSD(t.costos)}</div>
          <div className={styles.sub}>{fmtARS(t.costosArs)}</div>
        </div>
        <div className={styles.total}>
          <div className={styles.k}>Total a pagar</div>
          <div className={styles.v}>{fmtUSD(t.aPagar)}</div>
          <div className={styles.sub}>{fmtARS(t.aPagarArs)}</div>
        </div>
        <div className={styles.total}>
          <div className={styles.k}>Aumento nacionalización</div>
          <div className={styles.v}>{fmtPct(t.aumentoCostos)}</div>
          <div className={styles.sub}>sobre FOB, sin IVA</div>
        </div>
        <div className={styles.total}>
          <div className={styles.k}>Costo por unidad</div>
          <div className={styles.v}>{fmtUSD(t.costoPorUnidad)}</div>
          <div className={styles.sub}>{c.unidades} unidad(es)</div>
        </div>
      </div>

      {/* ── Comparación consolidado / full ───────────────────────────── */}
      <table className={styles.lineas} style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Opción de embarque</th>
            <th className={styles.num}>Flete</th>
            <th className={styles.num}>Total a pagar</th>
            <th className={styles.num}>Total costos</th>
            <th className={styles.num}>Aumento</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Marítimo consolidado — LCL</td>
            <td className={styles.num}>{fmtUSD(c.flete)}</td>
            <td className={styles.num}>{fmtUSD(c.totales.aPagar)}</td>
            <td className={styles.num}>{fmtUSD(c.totales.costos)}</td>
            <td className={styles.num}>{fmtPct(c.totales.aumentoCostos, 1)}</td>
          </tr>
          <tr>
            <td>
              Marítimo full — {contenedor.cantidad > 1 ? `${contenedor.cantidad} × ` : ""}
              {contenedor.label}
              {fullEsEstimado && <div className={styles.estimadoNota}>estimado</div>}
            </td>
            <td className={styles.num}>{fmtUSD(full.flete)}</td>
            <td className={styles.num}>{fmtUSD(full.totales.aPagar)}</td>
            <td className={styles.num}>{fmtUSD(full.totales.costos)}</td>
            <td className={styles.num}>{fmtPct(full.totales.aumentoCostos, 1)}</td>
          </tr>
        </tbody>
      </table>

      <div className={styles.pie}>
        <table className={styles.tc}>
          <tbody>
            <tr>
              <td>
                <span className={styles.k}>Tipo de cambio aduana</span> {fmtARS(tc)}
              </td>
              <td>
                <span className={styles.k}>Fuente</span> Centro Despachantes de Aduana
              </td>
              <td>
                <span className={styles.k}>Cotizaciones al</span> {fecha}
              </td>
            </tr>
          </tbody>
        </table>

        <div className={styles.firma}>
          <strong>VEGROUP</strong> — Asesoramiento integral en comercio exterior.
        </div>
        <div className={styles.disclaimer}>
          El presente presupuesto es estimado. El flete y el tipo de cambio son los del día de
          emisión y se reconfirman al cerrar la operación. Los gravámenes surgen de la posición
          arancelaria declarada; la clasificación definitiva la determina la aduana. El IVA, el IVA
          adicional y las percepciones de Ganancias e Ingresos Brutos son crédito fiscal o pago a
          cuenta recuperable, y por eso no integran el total de costos.
          {fullEsEstimado &&
            " La opción de contenedor completo está calculada con la tarifa por m³: la tarifa firme de flete FCL se cotiza caso por caso."}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function F({
  l,
  n,
  p,
  v,
  tc,
  sub,
}: {
  l: string;
  n?: string;
  p?: number;
  v: number;
  tc: number;
  sub?: boolean;
}) {
  return (
    <tr className={sub ? styles.subtotal : undefined}>
      <td>{l}</td>
      <td className={styles.pct}>{p != null ? fmtPct(p) : n}</td>
      <td className={styles.num}>{fmtUSD(v)}</td>
      <td className={styles.num}>{fmtARS(v * tc)}</td>
    </tr>
  );
}
