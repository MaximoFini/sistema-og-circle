"use client";

// VGRP-57 — ex vegroup@b550803 src/components/PriceStrategy.jsx, en Liquid
// Glass. Estrategia de venta posterior al cálculo de importación: a partir del
// costo real puesto en mano (calculadora madre) resuelve por qué canal conviene
// vender y a qué precio exacto para lograr el margen buscado.
//
// TODA la cuenta vive en lib/cotizador/estrategia.ts (port literal, con test
// de paridad contra el original). Este archivo es sólo el formulario y el
// render: mismos campos, textos, orden y comportamiento que el original.
//
// Cambios de forma respecto del original:
// - Campo con prefijo/sufijo ($, %, u) → TextField con la unidad en el label.
// - Pestañas Monotributo / Resp. inscripto → radio group segmentado.
// - Botones 20/30/40/50 % → toggles con aria-pressed.
// - Filas del ranking (divs con onClick) → radio group: se eligen con teclado.
// - Renglones del detalle y "según cómo te pague" → <table> con <th scope>.
// - Los avisos no laten (el original animaba el punto): punto fijo del tono.

import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import {
  type Aviso,
  CANALES,
  CATEGORIAS_ML,
  type ClaveCanal,
  type ClavePasarela,
  ESTADO_INICIAL,
  type EstadoEstrategia,
  evaluarEstrategia,
  type Fiscal,
  MEDIOS,
  money,
  num,
  PASARELAS,
  pct,
} from "@/lib/cotizador/estrategia";
import styles from "./PriceStrategy.module.css";

export interface PriceStrategyProps {
  /** Costo por unidad en ARS de la ruta elegida (totalPesos / unidades). */
  costoInicial?: number | null;
  /** Unidades del lote cotizado. */
  unidadesInicial?: number | null;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ================================================================== */
/*  PIEZAS                                                            */
/* ================================================================== */

function Selector({
  label,
  hint,
  valor,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  valor: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.campo}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.selectCaja}>
        <select
          id={id}
          className={styles.select}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          {children}
        </select>
        <Icon name="chevron" size={16} className={styles.selectFlecha} />
      </div>
      {hint && (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** TextField numérico: el original aceptaba "1.234,5" (lo lee `num`), así que es texto. */
function Numero({
  label,
  hint,
  valor,
  onChange,
}: {
  label: string;
  hint?: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      label={label}
      hint={hint}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={styles.inputNumero}
    />
  );
}

function Renglon({
  concepto,
  detalle,
  monto,
  resta,
  fuerte,
  borde,
  tenue,
}: {
  concepto: string;
  detalle?: string | null;
  monto: number;
  resta?: boolean;
  fuerte?: boolean;
  borde?: boolean;
  tenue?: boolean;
}) {
  const neg = resta || monto < 0;
  return (
    <tr className={cx(fuerte && styles.fuerte, borde && styles.borde, tenue && styles.tenue)}>
      <th scope="row" className={styles.concepto}>
        {concepto}
        {detalle && <span className={styles.conceptoDetalle}>{detalle}</span>}
      </th>
      <td className={cx(styles.monto, neg && styles.negativo)}>
        {resta ? "−" : ""}
        {money(Math.abs(monto) * (resta ? 1 : Math.sign(monto) || 1))}
      </td>
    </tr>
  );
}

const TONO_TEXTO: Record<Aviso["tono"], string> = {
  riesgo: "Riesgo",
  ojo: "Ojo",
  dato: "Dato",
};

/* ================================================================== */

// Estrategia de venta posterior al cálculo de importación: a partir del
// costo real puesto en mano (calculadora madre) resuelve por qué canal
// conviene vender y a qué precio exacto para lograr el margen buscado.
export function PriceStrategy({ costoInicial, unidadesInicial }: PriceStrategyProps) {
  const [costo, setCosto] = useState(ESTADO_INICIAL.costo);
  const [envio, setEnvio] = useState(ESTADO_INICIAL.envio);
  const [otros, setOtros] = useState(ESTADO_INICIAL.otros);
  const [fiscal, setFiscal] = useState<Fiscal>(ESTADO_INICIAL.fiscal);
  const [categoria, setCategoria] = useState(ESTADO_INICIAL.categoria);
  const [margen, setMargen] = useState(ESTADO_INICIAL.margen);
  const [pasarelaKey, setPasarelaKey] = useState<ClavePasarela>(ESTADO_INICIAL.pasarelaKey);
  const [canalKey, setCanalKey] = useState<ClaveCanal>(ESTADO_INICIAL.canalKey);
  const [unidades, setUnidades] = useState(ESTADO_INICIAL.unidades);

  const [avanzado, setAvanzado] = useState(false);
  const [ivaRecuperable, setIvaRecuperable] = useState(ESTADO_INICIAL.ivaRecuperable);
  const [mix, setMix] = useState(ESTADO_INICIAL.mix);
  const [planes, setPlanes] = useState(ESTADO_INICIAL.planes);
  const [comisionManual, setComisionManual] = useState(ESTADO_INICIAL.comisionManual);
  const [iibb, setIibb] = useState(ESTADO_INICIAL.iibb);
  const [inscriptoIIBB, setInscriptoIIBB] = useState(ESTADO_INICIAL.inscriptoIIBB);
  const [sirtac, setSirtac] = useState(ESTADO_INICIAL.sirtac);
  const [retIVA, setRetIVA] = useState(ESTADO_INICIAL.retIVA);
  const [retGan, setRetGan] = useState(ESTADO_INICIAL.retGan);
  const [retencionesRecuperables, setRetencionesRecuperables] = useState(
    ESTADO_INICIAL.retencionesRecuperables,
  );
  const [tasaCapital, setTasaCapital] = useState(ESTADO_INICIAL.tasaCapital);

  // Cambiar de canal, categoría o plan descarta la comisión manual (igual
  // que el original): los deps son el disparador, no algo que se lea adentro.
  useEffect(() => {
    setComisionManual("");
  }, [canalKey, categoria, planes]);

  // Se carga sola con el costo real que acaba de resolver la calculadora madre.
  useEffect(() => {
    if (costoInicial != null && costoInicial > 0) setCosto(String(Math.round(costoInicial)));
  }, [costoInicial]);
  useEffect(() => {
    if (unidadesInicial != null && unidadesInicial > 0)
      setUnidades(String(Math.round(unidadesInicial)));
  }, [unidadesInicial]);

  const estado = useMemo<EstadoEstrategia>(
    () => ({
      costo,
      envio,
      otros,
      fiscal,
      categoria,
      margen,
      pasarelaKey,
      canalKey,
      unidades,
      ivaRecuperable,
      mix,
      planes,
      comisionManual,
      iibb,
      inscriptoIIBB,
      sirtac,
      retIVA,
      retGan,
      retencionesRecuperables,
      tasaCapital,
    }),
    [
      costo,
      envio,
      otros,
      fiscal,
      categoria,
      margen,
      pasarelaKey,
      canalKey,
      unidades,
      ivaRecuperable,
      mix,
      planes,
      comisionManual,
      iibb,
      inscriptoIIBB,
      sirtac,
      retIVA,
      retGan,
      retencionesRecuperables,
      tasaCapital,
    ],
  );

  const { ri, entrada, ranking, sel, canal, mejor, u, lote, avisos } = useMemo(
    () => evaluarEstrategia(estado),
    [estado],
  );

  function aplicar(a: Aviso) {
    if (!a.accion) return;
    const { efecto } = a.accion;
    if (efecto.campo === "margen") setMargen(efecto.valor);
    else setFiscal(efecto.valor);
  }

  const id = useId();
  const tituloId = `${id}-titulo`;
  const avanzadoId = `${id}-avanzado`;

  return (
    <section className={styles.card} aria-labelledby={tituloId}>
      <div className={styles.cabecera}>
        <p className={styles.eyebrow}>VEGROUP · Estrategia de venta</p>
        <h2 className={styles.titulo} id={tituloId}>
          A cuánto vender y dónde conviene
        </h2>
      </div>

      <div className={styles.columnas}>
        {/* ============ PREGUNTAS ============ */}
        <div className={styles.preguntas}>
          <Numero
            label="¿Cuánto te costó el producto? ($)"
            hint="por unidad, puesto acá"
            valor={costo}
            onChange={setCosto}
          />

          <Numero
            label="Unidades del lote (u)"
            hint="cuántas trajiste"
            valor={unidades}
            onChange={setUnidades}
          />

          <Selector label="¿Qué vendés?" valor={categoria} onChange={setCategoria}>
            {Object.keys(CATEGORIAS_ML).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Selector>

          <fieldset className={styles.grupo}>
            <legend className={styles.label}>¿Cómo estás inscripto?</legend>
            <div className={styles.segmentado}>
              {(
                [
                  { k: "mono", t: "Monotributo" },
                  { k: "ri", t: "Resp. inscripto" },
                ] as const
              ).map((it) => (
                <label key={it.k} className={styles.segmento}>
                  <input
                    type="radio"
                    name={`${id}-fiscal`}
                    value={it.k}
                    checked={fiscal === it.k}
                    onChange={() => setFiscal(it.k)}
                    className={styles.segmentoInput}
                  />
                  <span className={styles.segmentoTexto}>{it.t}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.campo}>
            <fieldset className={styles.atajos}>
              <legend className={styles.srOnly}>Margen rápido</legend>
              {["20", "30", "40", "50"].map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={margen === v}
                  onClick={() => setMargen(v)}
                  className={margen === v ? styles.atajoActivo : styles.atajo}
                >
                  {v}%
                </button>
              ))}
            </fieldset>
            <Numero
              label="¿Cuánto querés ganar? (%)"
              hint="sobre la venta"
              valor={margen}
              onChange={setMargen}
            />
          </div>

          <Selector
            label="¿Por dónde cobrás?"
            hint="Solo aplica a tienda propia. En Mercado Libre el cobro ya viene incluido en su comisión."
            valor={pasarelaKey}
            onChange={(v) => setPasarelaKey(v as ClavePasarela)}
          >
            {Object.entries(PASARELAS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.n} — {p.detalle}
              </option>
            ))}
          </Selector>

          <div className={styles.avanzadoToggle}>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={avanzado}
              aria-controls={avanzadoId}
              onClick={() => setAvanzado(!avanzado)}
            >
              {avanzado ? "− ocultar ajustes" : "+ ajustes avanzados"}
            </Button>
            {!avanzado && (
              <p className={styles.nota}>
                Envío, impuestos, mix de pagos y comisión exacta. Ya vienen cargados con valores
                típicos.
              </p>
            )}
          </div>

          {avanzado && (
            <div className={styles.avanzado} id={avanzadoId}>
              <div className={styles.dosCol}>
                <Numero label="Envío que absorbés ($)" valor={envio} onChange={setEnvio} />
                <Numero label="Packaging ($)" valor={otros} onChange={setOtros} />
              </div>

              <Numero
                label="Comisión real del canal (%)"
                hint="Pisa la tabla de referencia. Vacío usa la tabla. El número exacto está en Costos de venta de tu cuenta."
                valor={comisionManual}
                onChange={setComisionManual}
              />

              {!canal.ml && (
                <Selector
                  label={`Plan de ${canal.nombre}`}
                  valor={planes[canalKey]}
                  onChange={(v) => setPlanes({ ...planes, [canalKey]: v })}
                >
                  {Object.entries(canal.planes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} — {v}%
                    </option>
                  ))}
                </Selector>
              )}

              <fieldset className={styles.grupo}>
                <legend className={styles.label}>
                  Mix de pagos{" "}
                  <span className={styles.legendNota}>qué porcentaje paga con cada medio</span>
                </legend>
                <div className={styles.dosCol}>
                  {MEDIOS.map((m) => (
                    <Numero
                      key={m.k}
                      label={`${m.n} (%)`}
                      valor={mix[m.k]}
                      onChange={(v) => setMix({ ...mix, [m.k]: v })}
                    />
                  ))}
                </div>
              </fieldset>

              <div className={styles.casillas}>
                <Checkbox
                  label="Inscripto en Ingresos Brutos"
                  checked={inscriptoIIBB}
                  onChange={(e) => setInscriptoIIBB(e.target.checked)}
                />
                {inscriptoIIBB && (
                  <Checkbox
                    label="Recupero las retenciones como pago a cuenta"
                    checked={retencionesRecuperables}
                    onChange={(e) => setRetencionesRecuperables(e.target.checked)}
                  />
                )}
                {ri && (
                  <Checkbox
                    label="El costo trae IVA que computo"
                    checked={ivaRecuperable}
                    onChange={(e) => setIvaRecuperable(e.target.checked)}
                  />
                )}
              </div>

              <div className={styles.dosCol}>
                {inscriptoIIBB && <Numero label="IIBB (%)" valor={iibb} onChange={setIibb} />}
                <Numero label="SIRTAC (%)" valor={sirtac} onChange={setSirtac} />
                {ri && (
                  <>
                    <Numero label="Ret. IVA (%)" valor={retIVA} onChange={setRetIVA} />
                    <Numero label="Ret. Ganancias (%)" valor={retGan} onChange={setRetGan} />
                  </>
                )}
                <Numero
                  label="Costo del capital (%)"
                  hint="mensual"
                  valor={tasaCapital}
                  onChange={setTasaCapital}
                />
              </div>
            </div>
          )}
        </div>

        {/* ============ RESULTADO ============ */}
        <div className={styles.resultado} aria-live="polite">
          {mejor && (
            <div className={styles.mejor}>
              <p className={styles.mejorClave}>Donde más barato podés vender</p>
              <p className={styles.mejorPrecio}>
                <span className={styles.mejorMonto}>{money(mejor.precio)}</span>
                <span className={styles.mejorCanal}>en {CANALES[mejor.k].nombre}</span>
              </p>
              <p className={styles.mejorPie}>
                Ganás {money(mejor.ganancia)} por unidad · {CANALES[mejor.k].variante}
              </p>
            </div>
          )}

          {lote && (
            <dl className={styles.lote}>
              {[
                { l: "Invertido en el lote", v: money(lote.inversion) },
                { l: `Ganancia por las ${u} u.`, v: money(lote.ganancia) },
                { l: "Ventas para recuperar", v: lote.recupero ? `${lote.recupero} u.` : "—" },
              ].map((x) => (
                <div key={x.l} className={styles.loteItem}>
                  <dt className={styles.loteClave}>{x.l}</dt>
                  <dd className={styles.loteValor}>{x.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {avisos.length > 0 && (
            <ul className={styles.avisos}>
              {avisos.map((a) => (
                <li key={a.id} className={cx(styles.aviso, styles[`tono_${a.tono}`])}>
                  <span className={styles.avisoPunto} aria-hidden="true" />
                  <div className={styles.avisoCuerpo}>
                    <p className={styles.avisoTitulo}>
                      <span className={styles.srOnly}>{TONO_TEXTO[a.tono]}: </span>
                      {a.titulo}
                    </p>
                    <p className={styles.avisoTexto}>{a.cuerpo}</p>
                    {a.accion && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => aplicar(a)}
                        className={styles.avisoAccion}
                      >
                        {a.accion.texto}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <fieldset className={styles.grupo}>
            <legend className={styles.seccion}>
              Precio necesario en cada canal para ganar {num(margen)}%
            </legend>
            <div className={styles.ranking}>
              {ranking.map((f) => {
                const c = CANALES[f.k];
                const activo = f.k === canalKey;
                return (
                  <label key={f.k} className={cx(styles.fila, activo && styles.filaActiva)}>
                    <input
                      type="radio"
                      name={`${id}-canal`}
                      value={f.k}
                      checked={activo}
                      onChange={() => setCanalKey(f.k)}
                      className={styles.srOnly}
                    />
                    <span className={styles.filaTexto}>
                      <span className={styles.filaNombre}>{c.nombre}</span>
                      <span className={styles.filaDetalle}>
                        {c.variante}
                        {f.comision != null ? ` · comisión ${f.comision}%` : ""}
                      </span>
                    </span>
                    <span className={styles.filaMontos}>
                      {f.imposible ? (
                        <span className={styles.noDa}>no da margen</span>
                      ) : (
                        <>
                          <span className={styles.filaPrecio}>{money(f.precio)}</span>
                          <span className={styles.filaGanancia}>ganás {money(f.ganancia)}</span>
                        </>
                      )}
                    </span>
                    <Icon
                      name="check"
                      size={18}
                      className={activo ? styles.filaCheck : styles.filaCheckOculto}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          {sel.imposible ? (
            <div className={styles.imposible} role="status">
              <p className={styles.imposibleTitulo}>No da margen</p>
              <p className={styles.imposibleTexto}>
                En este canal se va el {pct(sel.sobreVenta, 0)} del precio antes de tu ganancia. Con{" "}
                {num(margen)}% encima no cierra. Bajá el margen o elegí otro canal.
              </p>
            </div>
          ) : (
            <>
              <table className={styles.tabla}>
                <caption className={styles.seccion}>
                  Detalle en {canal.nombre} · {canal.variante}
                </caption>
                <tbody>
                  <Renglon concepto="Precio de venta" monto={sel.precio} fuerte />
                  {ri && (
                    <Renglon
                      concepto="IVA dentro del precio"
                      detalle="21%"
                      monto={sel.ivaDebito}
                      resta
                      borde
                    />
                  )}
                  <Renglon
                    concepto={`Comisión ${canal.nombre}`}
                    detalle={`${sel.comision}%`}
                    monto={sel.comisionCanal}
                    resta
                    borde
                  />
                  {sel.fijo > 0 && (
                    <Renglon
                      concepto="Costo fijo por unidad"
                      detalle="venta menor a $33.000"
                      monto={sel.fijo}
                      resta
                    />
                  )}
                  {sel.arancelPago > 0 && (
                    <Renglon
                      concepto="Costo de cobrar"
                      detalle={`promedio ${pct(sel.p.arancel, 2)}`}
                      monto={sel.arancelPago}
                      resta
                    />
                  )}
                  {!ri && sel.ivaCargos > 0 && (
                    <Renglon concepto="IVA sobre esos cargos" monto={sel.ivaCargos} resta />
                  )}
                  {sel.iibb > 0 && (
                    <Renglon
                      concepto="Ingresos brutos"
                      detalle={`${num(iibb)}%`}
                      monto={sel.iibb}
                      resta
                    />
                  )}
                  {sel.retComoCosto > 0 && (
                    <Renglon
                      concepto="Retenciones que no recuperás"
                      monto={sel.retComoCosto}
                      resta
                    />
                  )}
                  {sel.finan > 0 && (
                    <Renglon
                      concepto="Plata parada hasta cobrar"
                      detalle={`${sel.p.dias.toFixed(0)} días`}
                      monto={sel.finan}
                      resta
                    />
                  )}
                  {sel.envio > 0 && <Renglon concepto="Envío" monto={sel.envio} resta />}
                  <Renglon
                    concepto="Costo del producto"
                    detalle={ri && ivaRecuperable ? "neto de IVA" : null}
                    monto={sel.costoProd}
                    resta
                    borde
                  />
                  {sel.otros > 0 && <Renglon concepto="Packaging" monto={sel.otros} resta />}
                  <Renglon
                    concepto={ri ? "Antes de Ganancias" : "Te queda"}
                    monto={sel.ganancia}
                    fuerte
                    borde
                  />
                  {ri && (
                    <>
                      <Renglon
                        concepto="Impuesto a las Ganancias"
                        detalle="35%"
                        monto={sel.gan35}
                        resta
                      />
                      <Renglon concepto="Te queda" monto={sel.gananciaFinal} fuerte borde />
                    </>
                  )}
                  {entrada.retencionesRecuperables && sel.retTotal > 0 && (
                    <Renglon
                      tenue
                      borde
                      concepto="Retenciones a recuperar"
                      detalle="no es costo, es plata trabada"
                      monto={sel.retTotal}
                    />
                  )}
                </tbody>
              </table>

              <table className={styles.tabla}>
                <caption className={styles.seccion}>
                  A ese precio, según cómo te pague el cliente
                </caption>
                <thead className={styles.srOnly}>
                  <tr>
                    <th scope="col">Medio de pago</th>
                    <th scope="col">Ganancia y margen</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.porMedio.map((m) => {
                    const malo = m.ganancia <= 0;
                    return (
                      <tr key={m.k} className={styles.medio}>
                        <th scope="row" className={styles.concepto}>
                          {m.n}
                          <span className={styles.medioPeso}>
                            {(m.w * 100).toFixed(0)}% de tus ventas
                          </span>
                        </th>
                        <td className={cx(styles.medioMontos, malo && styles.medioMalo)}>
                          <span className={styles.medioGanancia}>{money(m.ganancia)}</span>
                          <span className={styles.medioMargen}>{pct(m.margen)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <p className={styles.pie}>
        Los valores por defecto son de referencia 2026. Mercado Libre ajusta comisiones por
        categoría y por provincia: el número exacto de tu publicación está en Costos de venta dentro
        de tu cuenta, y podés cargarlo en ajustes avanzados. No están incluidos publicidad,
        devoluciones ni almacenamiento.
      </p>
    </section>
  );
}
