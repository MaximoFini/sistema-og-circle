"use client";

// VGRP-58 — ex vegroup@b550803 src/components/MaritimoResultado.jsx, en
// Liquid Glass. Mismo contenido y mismo orden que el original; cambia el
// cómo se ve — specs/bloque-12-calculadoras/design-vgrp58.md → "UI: port a
// Liquid Glass". Lo carga CotizadorMaritimo con next/dynamic.
//
// Las dos cotizaciones que pidió el usuario: consolidado y full, juntas. Hoy
// salen del mismo cálculo porque el flete de contenedor completo lo cotiza
// el despachante caso por caso — non-goal explícito (requirements-vgrp58.md).
// La de full muestra en qué contenedor entra la carga y manda a consultarle
// la tarifa firme; cuando vuelve con el número, se carga y las dos se pueden
// comparar de verdad.

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import {
  fmtARS,
  fmtNum,
  fmtPct,
  fmtUSD,
  type Puerto,
  SUMA_FIJOS,
  WHATSAPP_DESPACHANTE,
} from "@/lib/cotizador/tarifasMaritimo";
import type {
  ContenedorSugerido,
  FiscalMaritimo,
  ResultadoAmbas,
  ResultadoMaritimo,
} from "@/lib/cotizador/types";
import { textoResumenMaritimo } from "@/lib/cotizador/whatsappMaritimo";
import { Conceptos } from "./Conceptos";
import cotizadorStyles from "./cotizador.module.css";
import styles from "./maritimo.module.css";
import { notaFlete } from "./notaFlete";

export interface MaritimoResultadoProps {
  res: ResultadoAmbas;
  fiscal: FiscalMaritimo;
  puerto: Puerto | undefined;
  fleteFull: string;
  setFleteFull: (v: string) => void;
  refNumber: string;
  /** VGRP-69: para el texto de "Enviar por WhatsApp". */
  producto: string;
  /** `links.whatsapp` de la config. */
  whatsappContacto: string;
}

export function MaritimoResultado({
  res,
  fiscal,
  puerto,
  fleteFull,
  setFleteFull,
  refNumber,
  producto,
  whatsappContacto,
}: MaritimoResultadoProps) {
  const [ver, setVer] = useState<"consolidado" | "full">("consolidado");
  const { consolidado, full, contenedor, fullEsEstimado } = res;
  const actual = ver === "full" ? full : consolidado;
  const id = useId();

  return (
    <>
      {/* ── Los dos números, uno al lado del otro ─────────────────────── */}
      <section className={cotizadorStyles.card} aria-labelledby={`${id}-titulo`}>
        <div className={cotizadorStyles.cardCabecera}>
          <h2 className={cotizadorStyles.cardTitulo} id={`${id}-titulo`}>
            <span className={cotizadorStyles.paso} aria-hidden="true">
              4
            </span>
            Cotización
          </h2>
          <p className={cotizadorStyles.cardSubtitulo}>
            El <strong>costo real</strong> es sin IVA ni percepciones: son recuperables y es el
            número con el que se pone precio. El <strong>total a pagar</strong> es la plata que hay
            que tener el día del despacho.
          </p>
        </div>

        <div className={styles.dos}>
          <Opcion
            titulo="Marítimo consolidado"
            sub="LCL · comparte contenedor"
            r={consolidado}
            activo={ver === "consolidado"}
            onClick={() => setVer("consolidado")}
          />
          <Opcion
            titulo="Marítimo full"
            sub={`FCL · ${contenedor.cantidad > 1 ? `${contenedor.cantidad} × ` : ""}${contenedor.label}`}
            r={full}
            activo={ver === "full"}
            estimado={fullEsEstimado}
            onClick={() => setVer("full")}
          />
        </div>

        {fullEsEstimado && (
          <div className={cotizadorStyles.aviso}>
            <p className={cotizadorStyles.avisoTexto}>
              <strong>La cotización full es estimada.</strong> Está calculada con la misma tarifa
              por m³ que el consolidado, porque el flete de contenedor completo se cotiza caso por
              caso. La carga entra en{" "}
              {contenedor.cantidad > 1 ? `${contenedor.cantidad} contenedores ` : "un "}
              <strong>{contenedor.label}</strong> ({fmtPct(contenedor.ocupacion, 0)} de ocupación,
              limita el {contenedor.limita}).{" "}
              <strong>Consultale la tarifa firme al despachante por WhatsApp</strong> y cargala acá
              abajo.
              {WHATSAPP_DESPACHANTE && (
                <>
                  {" "}
                  <a
                    href={`https://wa.me/${WHATSAPP_DESPACHANTE}?text=${encodeURIComponent(
                      textoWhatsapp({ refNumber, res, fiscal, puerto, contenedor }),
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir el chat con los datos cargados →
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        <div className={styles.grilla2}>
          <TextField
            label="Flete del contenedor completo (USD) — lo que cotizó el despachante"
            inputMode="decimal"
            value={fleteFull}
            onChange={(e) => setFleteFull(e.target.value)}
            placeholder={`sin cargar · se estima en ${fmtUSD(full.fleteTarifa)}`}
            hint="El número que te pasó el despachante por el contenedor entero, puerto a puerto. Con eso el full deja de ser estimado."
          />
          <TextField
            label="Diferencia entre las dos"
            readOnly
            value={
              fullEsEstimado
                ? "cargá el flete del contenedor"
                : `${full.totales.costos > consolidado.totales.costos ? "Consolidado" : "Full"} conviene por ${fmtUSD(Math.abs(full.totales.costos - consolidado.totales.costos))}`
            }
          />
        </div>
      </section>

      {/* ── Desglose de la opción elegida ─────────────────────────────── */}
      <section className={cotizadorStyles.card}>
        <h3 className={cotizadorStyles.cardTitulo}>
          Desglose — {ver === "full" ? "marítimo full" : "marítimo consolidado"}
        </h3>
        <div className={styles.scroll}>
          <Desglose r={actual} fiscal={fiscal} puerto={puerto} />
        </div>

        <div className={cotizadorStyles.barraAcciones}>
          <Button onClick={() => window.print()}>
            <Icon name="documento" size={18} />
            Descargar PDF
          </Button>
          <a
            className={cotizadorStyles.linkWhatsapp}
            href={`https://wa.me/?text=${encodeURIComponent(
              textoResumenMaritimo({ refNumber, producto, fiscal, puerto, res, whatsappContacto }),
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="mensaje" size={18} />
            Enviar por WhatsApp
          </a>
          <span className={cotizadorStyles.numeroCotizacion}>
            Cotización N° {refNumber} — el PDF sale con las dos opciones.
          </span>
        </div>

        <Conceptos terminos={["tnm3", "consolidado", "cif", "die", "te", "iva", "recuperable"]} />
      </section>
    </>
  );
}

function Opcion({
  titulo,
  sub,
  r,
  activo,
  estimado,
  onClick,
}: {
  titulo: string;
  sub: string;
  r: ResultadoMaritimo;
  activo: boolean;
  estimado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={activo ? `${styles.opcion} ${styles.opcionActiva}` : styles.opcion}
      onClick={onClick}
      aria-pressed={activo}
    >
      <div className={styles.opcionCabecera}>
        <span className={styles.opcionTitulo}>{titulo}</span>
        {estimado && <span className={styles.estimado}>estimado</span>}
      </div>
      <div className={styles.opcionSub}>{sub}</div>
      <div className={styles.opcionMonto}>{fmtUSD(r.totales.costos)}</div>
      <div className={styles.opcionArs}>{fmtARS(r.totales.costosArs)}</div>
      <dl className={styles.opcionDl}>
        <div>
          <dt className={styles.opcionDt}>Total a pagar</dt>
          <dd className={styles.opcionDd}>{fmtUSD(r.totales.aPagar)}</dd>
        </div>
        <div>
          <dt className={styles.opcionDt}>Aumento s/FOB</dt>
          <dd className={styles.opcionDd}>{fmtPct(r.totales.aumentoCostos)}</dd>
        </div>
        <div>
          <dt className={styles.opcionDt}>Por unidad</dt>
          <dd className={styles.opcionDd}>{fmtUSD(r.totales.costoPorUnidad)}</dd>
        </div>
      </dl>
    </button>
  );
}

function Desglose({
  r,
  fiscal,
  puerto,
}: {
  r: ResultadoMaritimo;
  fiscal: FiscalMaritimo;
  puerto: Puerto | undefined;
}) {
  const { despacho: d, operativos: op, totales: t, medidas: m, tc } = r;

  return (
    <>
      <div className={styles.meta}>
        <Meta k="Volumen" v={`${fmtNum(m.m3, 3)} m³`} />
        <Meta k="Peso" v={`${fmtNum(m.kg, 0)} kg`} />
        <Meta
          k="TN/m³ facturable"
          v={fmtNum(m.wm, 3)}
          hint={m.porVolumen ? "manda el volumen" : "manda el peso"}
        />
        <Meta k="Posición SIM" v={fiscal.sim || "—"} />
        <Meta k="TC aduana" v={fmtARS(tc)} hint="CDA" />
        {puerto && <Meta k="Tránsito" v={`${puerto.transito} días`} hint={puerto.label} />}
      </div>

      <div className={styles.seccion}>
        <span>Despacho de importación</span>
      </div>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th className={styles.encabezadoCol}>Concepto</th>
            <th className={`${styles.encabezadoCol} ${styles.centro}`}>Alícuota</th>
            <th className={`${styles.encabezadoCol} ${styles.der}`}>Monto USD</th>
            <th className={`${styles.encabezadoCol} ${styles.der}`}>Monto $</th>
          </tr>
        </thead>
        <tbody>
          <Fila label="Valor FOB" nota="Mercadería" usd={d.fob} tc={tc} />
          <Fila
            label="Flete internacional"
            nota={`${fmtPct(r.fleteDeclaradoPct, 0)} del pagado`}
            usd={d.flete}
            tc={tc}
          />
          <Fila label="Seguro" nota="1% s/FOB + flete" usd={d.seguro} tc={tc} />
          <Fila label="Valor CIF" nota="Base imponible" usd={d.cif} tc={tc} strong />

          <Fila label="Derechos" pct={d.pct.derechos} usd={d.derechos} tc={tc} />
          <Fila label="Estadística" pct={d.pct.estadistica} usd={d.estadistica} tc={tc} />
          <Fila label="Base IVA" usd={d.baseIva} tc={tc} strong />
          <Fila label="I.V.A." pct={d.pct.iva} usd={d.iva} tc={tc} verde />
          <Fila
            label="I.V.A. adicional"
            pct={d.pct.ivaAdicional}
            usd={d.ivaAdicional}
            tc={tc}
            verde
          />
          <Fila label="Ganancias" pct={d.pct.ganancias} usd={d.ganancias} tc={tc} verde />
          <Fila label="Ingresos brutos" pct={d.pct.iibb} usd={d.iibb} tc={tc} verde />
          <Fila label="Arancel SIM" usd={d.arancelSim} tc={tc} />
          <Fila label="Total gravámenes" usd={d.totalGravamenes} tc={tc} total />
        </tbody>
      </table>

      <div className={styles.seccion}>
        <span>Gastos operativos</span>
        <span className={styles.seccionNota}>
          los siete fijos suman {fmtUSD(SUMA_FIJOS)} en toda importación
        </span>
      </div>
      <table className={styles.tabla}>
        <tbody>
          {op.lineas.map((l) => (
            <Fila
              key={l.key}
              label={l.label}
              nota={l.key === "flete" ? notaFlete(r.fleteEsOverride, m.wm) : l.iva ? "con IVA" : ""}
              usd={l.usd}
              tc={tc}
            />
          ))}
          <Fila
            label={`I.V.A. ${op.ivaPct}%`}
            nota="ítem único · factura A"
            usd={op.ivaGastos}
            tc={tc}
            verde
          />
          <Fila label="Total gastos operativos" usd={op.total} tc={tc} total />
        </tbody>
      </table>

      <div className={styles.seccion}>
        <span>Totales</span>
      </div>
      <table className={styles.tabla}>
        <tbody>
          <Fila label="Total a pagar" nota="el día del despacho" usd={t.aPagar} tc={tc} strong />
          <Fila
            label="IVA y percepciones recuperables"
            nota="crédito fiscal y pagos a cuenta"
            usd={-t.recuperable}
            tc={tc}
            verde
          />
          <Fila label="Total costos" nota="con esto se pone precio" usd={t.costos} tc={tc} total />
        </tbody>
      </table>

      <div className={styles.totalBox}>
        <div>
          <div className={styles.totalBoxClave}>Costo real (sin IVA)</div>
          <div className={styles.totalBoxValor}>{fmtUSD(t.costos)}</div>
          <div className={styles.totalBoxNota}>{fmtARS(t.costosArs)}</div>
        </div>
        <div>
          <div className={styles.totalBoxClave}>Aumento nacionalización</div>
          <div className={styles.totalBoxValor}>{fmtPct(t.aumentoCostos)}</div>
          <div className={styles.totalBoxNota}>sobre FOB · sin IVA</div>
        </div>
        <div>
          <div className={styles.totalBoxClave}>Costo por unidad</div>
          <div className={styles.totalBoxValor}>{fmtUSD(t.costoPorUnidad)}</div>
          <div className={styles.totalBoxNota}>{r.unidades} unidad(es)</div>
        </div>
      </div>
    </>
  );
}

function Meta({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div>
      <div className={styles.metaClave}>{k}</div>
      <div className={styles.metaValor}>{v}</div>
      {hint && <div className={styles.metaNota}>{hint}</div>}
    </div>
  );
}

function Fila({
  label,
  nota,
  pct,
  usd,
  tc,
  strong,
  total,
  verde,
}: {
  label: string;
  nota?: string;
  pct?: number;
  usd: number;
  tc: number;
  strong?: boolean;
  total?: boolean;
  verde?: boolean;
}) {
  const cls = total ? styles.filaTotal : strong ? styles.filaSub : verde ? styles.filaVerde : "";
  return (
    <tr className={cls}>
      <td>{label}</td>
      <td className={`${styles.centro} ${styles.nota}`}>{pct != null ? fmtPct(pct) : nota}</td>
      <td className={styles.der}>{fmtUSD(usd)}</td>
      <td className={styles.der}>{fmtARS(usd * tc)}</td>
    </tr>
  );
}

function textoWhatsapp({
  refNumber,
  res,
  fiscal,
  puerto,
  contenedor,
}: {
  refNumber: string;
  res: ResultadoAmbas;
  fiscal: FiscalMaritimo;
  puerto: Puerto | undefined;
  contenedor: ContenedorSugerido;
}): string {
  const { consolidado: c } = res;
  return [
    `Hola! Necesito cotización de flete marítimo FULL — ref ${refNumber}.`,
    puerto ? `Origen: ${puerto.label} → Buenos Aires.` : null,
    `Carga: ${fmtNum(c.medidas.m3, 3)} m³ · ${fmtNum(c.medidas.kg, 0)} kg.`,
    `Entra en ${contenedor.cantidad > 1 ? `${contenedor.cantidad} × ` : ""}${contenedor.label}.`,
    fiscal.sim ? `Posición SIM: ${fiscal.sim}.` : null,
    "¿Cuánto sale el contenedor puerta a puerto?",
  ]
    .filter(Boolean)
    .join("\n");
}
