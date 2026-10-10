"use client";

// VGRP-57 — ex vegroup@b550803 src/components/RouteBreakdown.jsx, en Liquid
// Glass. Mismo contenido y mismos números que el original; cambia el cómo se
// ve (ver specs/bloque-12-calculadoras/design-vgrp57.md → "UI: port a Liquid
// Glass"). Lo carga CotizadorCourier con next/dynamic.
//
// - Siempre visible: el costo real (protagonista), por unidad y por kg, lo que
//   se paga al proveedor y en destino, el total, y el costo en cada depósito.
// - El desglose de todos los conceptos va en un <details> cerrado: es un dato
//   de consulta (y sale completo en el PDF), no lo primero que se necesita.
// - El desglose es una <table> (concepto como <th scope="row">, monto USD a la
//   derecha) partida en <tbody> por grupo, como los rótulos del original.
// - No recuperable vs recuperable: el original lo marcaba sólo con fondo rojo
//   o verde. Acá el color va en el punto y en los totales (--danger /
//   --success), y el texto lo dice igual: leyenda, rótulos de grupo y
//   "Total no recuperable" / "Total recuperable".
// - Sin `routeId`, las 3 rutas son un radio group (antes, divs clickeables).

import { useId, useState } from "react";
import { costoRealPesos, costoRealPorKg, fmtARS, fmtUSD, LABELS } from "@/lib/cotizador/calc";
import type { ClaveEtiqueta, GastosDestino, ResultadoRutas, RutaId } from "@/lib/cotizador/types";
import { type Concepto, Conceptos, InfoTip } from "./Conceptos";
import styles from "./RouteBreakdown.module.css";

// Mismo orden de líneas que la planilla madre (B17–B26 y B30). El FOB se
// muestra aparte (es lo que se paga al proveedor, no al courier) para que no
// se confunda con los gastos de destino al sumarlos.
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
const GREEN_ORDER: "iva"[] = ["iva"];

// Renglones del desglose que tienen definición en el glosario.
const AYUDA_LINEA: Partial<Record<ClaveEtiqueta, Concepto>> = {
  derechos: "die",
  estadistica: "te",
  iva: "iva",
  volumetrico: "volumetrico",
};

export interface RouteBreakdownProps {
  /** Lo que devuelve calcAllRoutes(): las 3 rutas y la más conveniente. */
  data: ResultadoRutas;
  /**
   * Depósito elegido. Con él, el resumen de esa ruta (y las otras como
   * referencia); sin él, las 3 rutas elegibles. Igual que el original.
   */
  routeId?: RutaId | null;
}

function Linea({
  clave,
  monto,
  tipo,
}: {
  clave: ClaveEtiqueta;
  monto: number;
  tipo: "noRecuperable" | "recuperable";
}) {
  const ayuda = AYUDA_LINEA[clave];
  return (
    <tr className={styles[tipo]}>
      <th scope="row" className={styles.concepto}>
        <span className={styles.punto} aria-hidden="true" />
        {LABELS[clave]}
        {ayuda && <InfoTip termino={ayuda} />}
      </th>
      <td className={styles.monto}>{fmtUSD(monto)}</td>
    </tr>
  );
}

// Resumen de la cotización. Con `routeId` muestra el resumen del depósito
// elegido (y el costo en los otros como comparación); sin él, las 3 rutas
// clickeables.
export function RouteBreakdown({ data, routeId }: RouteBreakdownProps) {
  const { results, mejorRuta } = data;
  const [active, setActive] = useState<RutaId>(routeId || mejorRuta);
  const current = results.find((r) => r.route === (routeId || active)) || results[0];
  const id = useId();
  const tituloId = `${id}-titulo`;
  const desgloseId = `${id}-desglose`;
  const destinoConIva = current.totalGastosDestino + current.recuperable.iva;
  const pesosCostoReal = costoRealPesos(current);

  return (
    <section className={styles.card} aria-labelledby={tituloId}>
      <div className={styles.cabecera}>
        <h2 className={styles.titulo} id={tituloId}>
          <span className={styles.paso} aria-hidden="true">
            3
          </span>
          {routeId ? `Resumen — depósito ${current.label}` : "Costo por ruta"}
        </h2>
        <p className={styles.subtitulo}>
          {routeId
            ? `Tiempo estimado ${current.tiempoEstimado}.`
            : "La ruta más conveniente aparece destacada."}
        </p>
      </div>

      {!routeId && (
        <fieldset className={styles.rutas}>
          <legend className={styles.srOnly}>Ruta a desglosar</legend>
          {results.map((r) => {
            const elegida = r.route === active;
            return (
              <label
                key={r.route}
                className={[styles.ruta, elegida ? styles.rutaElegida : null]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="radio"
                  name={`${id}-ruta`}
                  value={r.route}
                  checked={elegida}
                  onChange={() => setActive(r.route)}
                  className={styles.radio}
                />
                <span className={styles.rutaTexto}>
                  {r.route === mejorRuta && <span className={styles.badge}>Más conveniente</span>}
                  <span className={styles.rutaNombre}>{r.label}</span>
                  <span className={styles.rutaPais}>
                    {r.pais} · flete {fmtUSD(r.freightPerKg)}/kg · {r.tiempoEstimado}
                  </span>
                  <span className={styles.rutaCosto}>{fmtUSD(r.costoRealEfectivo)}</span>
                  <span className={styles.rutaUnidad}>{fmtUSD(r.costoPorUnidad)} / unidad</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className={styles.detalle}>
        <div className={styles.totales}>
          <dl className={styles.principal}>
            <div className={styles.total}>
              <dt className={styles.totalClave}>Costo real puesto acá (sin IVA recuperable)</dt>
              <dd className={styles.totalDestacado}>{fmtUSD(current.costoRealEfectivo)}</dd>
              {pesosCostoReal != null && (
                <dd className={styles.totalNota}>{fmtARS(pesosCostoReal)} en pesos</dd>
              )}
            </div>
            <div className={styles.total}>
              <dt className={styles.totalClave}>Costo real por unidad</dt>
              <dd className={styles.totalAcento}>{fmtUSD(current.costoPorUnidad)}</dd>
            </div>
            <div className={styles.total}>
              <dt className={styles.totalClave}>Costo real por kg</dt>
              <dd className={styles.totalValor}>{fmtUSD(costoRealPorKg(current))}</dd>
            </div>
          </dl>

          <dl className={styles.totalesPago}>
            <div className={styles.total}>
              <dt className={styles.totalClave}>Lo que pagás a tu proveedor</dt>
              <dd className={styles.totalValor}>{fmtUSD(current.fob)}</dd>
              {current.proveedorPesos != null && (
                <dd className={styles.totalNota}>
                  {fmtARS(current.proveedorPesos)} (CCL ${current.dolarCCL})
                </dd>
              )}
            </div>
            <div className={styles.total}>
              <dt className={styles.totalClave}>Lo que pagás en destino</dt>
              <dd className={styles.destino}>
                <dl className={styles.destinoPar}>
                  <div className={styles.total}>
                    <dt className={styles.totalClave}>Sin IVA</dt>
                    <dd className={styles.totalValor}>{fmtUSD(current.totalGastosDestino)}</dd>
                  </div>
                  <div className={styles.total}>
                    <dt className={styles.totalClave}>Con IVA</dt>
                    <dd className={styles.totalValor}>{fmtUSD(destinoConIva)}</dd>
                  </div>
                </dl>
              </dd>
              {current.destinoPesos != null && (
                <dd className={styles.totalNota}>
                  {fmtARS(current.destinoPesos)} sin IVA ·{" "}
                  {fmtARS(current.destinoPesos + (current.ivaPesos || 0))} con IVA (BNA $
                  {current.dolarBN})
                </dd>
              )}
            </div>
            <div className={styles.total}>
              <dt className={styles.totalClave}>Total USD</dt>
              <dd className={styles.totalValor}>{fmtUSD(current.totalUSD)}</dd>
              {current.totalPesos != null && (
                <dd className={styles.totalNota}>
                  {fmtARS(current.totalPesos)} en pesos
                  {/* `> 0` y no `a && b`: con un dólar en 0, React imprimía un "0" suelto (B12-02). */}
                  {Number(current.dolarCCL) > 0 &&
                    Number(current.dolarBN) > 0 &&
                    current.dolarCCL !== current.dolarBN &&
                    ` · FOB × CCL $${current.dolarCCL} + destino × BNA $${current.dolarBN}`}
                </dd>
              )}
            </div>
          </dl>
        </div>

        {current.volumen > 0 && (
          <p className={styles.aviso} role="note">
            Peso volumétrico ({current.pesoVolumetrico.toFixed(1)} kg) supera al real: se cobran{" "}
            {current.volumen.toFixed(1)} kg de exceso volumétrico.
          </p>
        )}

        {routeId && (
          <table className={styles.comparador} aria-label="Costo real en cada depósito">
            <thead className={styles.srOnly}>
              <tr>
                <th scope="col">Depósito</th>
                <th scope="col">Costo real</th>
                <th scope="col">Tiempo estimado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={r.route}
                  className={r.route === current.route ? styles.filaElegida : undefined}
                >
                  <th scope="row" className={styles.concepto}>
                    {r.label}
                    {r.route === current.route && <span className={styles.badge}>Elegido</span>}
                  </th>
                  <td className={styles.monto}>{fmtUSD(r.costoRealEfectivo)}</td>
                  <td className={styles.tiempo}>{r.tiempoEstimado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <details className={styles.desgloseDetalle}>
          <summary className={styles.desgloseResumen} id={desgloseId}>
            Ver el desglose completo de {current.label}
          </summary>
          <ul className={styles.leyenda}>
            <li className={styles.noRecuperable}>
              <span className={styles.punto} aria-hidden="true" />
              No recuperable (costo real)
            </li>
            <li className={styles.recuperable}>
              <span className={styles.punto} aria-hidden="true" />
              Recuperable (crédito fiscal)
            </li>
          </ul>

          <table className={styles.desglose} aria-labelledby={desgloseId}>
            <thead className={styles.srOnly}>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col">USD</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.referencia}>
                <th scope="row" className={styles.concepto}>
                  {LABELS.cif}
                  <InfoTip termino="cif" />
                </th>
                <td className={styles.monto}>{fmtUSD(current.cif)}</td>
              </tr>
            </tbody>

            <tbody>
              <tr>
                <th scope="rowgroup" colSpan={2} className={styles.grupo}>
                  Lo que le pagás a tu proveedor
                </th>
              </tr>
              <Linea clave="fob" monto={current.fob} tipo="noRecuperable" />
            </tbody>

            <tbody>
              <tr>
                <th scope="rowgroup" colSpan={2} className={styles.grupo}>
                  Lo que pagás en destino (gastos de importación)
                </th>
              </tr>
              {DESTINO_ORDER.map((k) => (
                <Linea key={k} clave={k} monto={current.noRecuperable[k]} tipo="noRecuperable" />
              ))}
              <tr className={styles.subtotal}>
                <th scope="row" className={styles.concepto}>
                  Subtotal gastos en destino
                </th>
                <td className={`${styles.monto} ${styles.montoNoRecuperable}`}>
                  {fmtUSD(current.totalGastosDestino)}
                </td>
              </tr>
            </tbody>

            <tbody>
              <tr className={styles.subtotal}>
                <th scope="row" className={styles.concepto}>
                  Total no recuperable (proveedor + destino)
                </th>
                <td className={`${styles.monto} ${styles.montoNoRecuperable}`}>
                  {fmtUSD(current.totalNoRecuperable)}
                </td>
              </tr>
            </tbody>

            <tbody>
              {GREEN_ORDER.map((k) => (
                <Linea key={k} clave={k} monto={current.recuperable[k]} tipo="recuperable" />
              ))}
              <tr className={styles.subtotal}>
                <th scope="row" className={styles.concepto}>
                  Total recuperable
                </th>
                <td className={`${styles.monto} ${styles.montoRecuperable}`}>
                  {fmtUSD(current.totalRecuperable)}
                </td>
              </tr>
            </tbody>
          </table>
        </details>

        <Conceptos terminos={["cif", "die", "te", "iva", "recuperable", "volumetrico"]} />
      </div>
    </section>
  );
}
