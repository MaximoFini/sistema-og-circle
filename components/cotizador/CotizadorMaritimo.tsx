"use client";

// VGRP-58 — ex vegroup@b550803 src/components/MaritimoQuote.jsx, renombrado
// (mismo motivo que AgentQuote → CotizadorCourier) y en Liquid Glass. La
// lógica, los textos, los 4 pasos y los cálculos son los del original; sólo
// cambia la capa visual — ver specs/bloque-12-calculadoras/design-vgrp58.md
// → "UI: port a Liquid Glass".
//
// Reusa toda la infraestructura de VGRP-57: búsqueda NCM local
// (lib/cotizador/ncm), identificar-ncm/sugerir-partidas/extraer-documento
// (lib/cotizador/api.ts), ProformaUpload. Lo único nuevo es getDolarCDA() (el
// TC sale del Centro Despachantes de Aduana, no de dolarapi.com/BNA) y el
// motor marítimo (lib/cotizador/calcMaritimo.ts).
//
// Desvíos a propósito, mismo criterio que CotizadorCourier:
// - Accesibilidad: puerto de carga es un radio group real (fieldset + input
//   radio, no <select>) — decisión del equipo (2026-09-28), mismo patrón
//   visual que el selector de régimen; el campo a mano es un <details> con
//   Button ghost, TextField en vez de <input> sin label.
// - Si el CDA no responde, el campo de TC queda editable con el aviso (nunca
//   se inventa un valor) — mismo criterio que el TC BNA en CotizadorCourier.
// - MaritimoResultado y MaritimoQuoteDoc se cargan en diferido (next/dynamic):
//   no pesan hasta que hay un resultado. calcMaritimo.ts/tarifasMaritimo.ts
//   viajan en el mismo chunk diferido que este componente (CotizadorSelector
//   ya lo importa con next/dynamic).

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import {
  type CandidatoIdentificacion,
  type DatosProforma,
  ErrorApi,
  getDolarCDA,
  type IdentificacionNcm,
  identifyNCM,
  suggestPartidas,
} from "@/lib/cotizador/api";
import { calcAmbas } from "@/lib/cotizador/calcMaritimo";
import {
  fmtNum,
  num,
  PUERTO_DESCARGA,
  PUERTOS,
  sugerirPuerto,
} from "@/lib/cotizador/tarifasMaritimo";
import type { CandidatoSim, FiscalMaritimo, PosicionElegida } from "@/lib/cotizador/types";
import cotizadorStyles from "./cotizador.module.css";
import styles from "./maritimo.module.css";

/** `getNcm` de lib/cotizador/ncm/base, importado en diferido (igual que CotizadorCourier). */
type BuscarNcm = typeof import("@/lib/cotizador/ncm/base")["getNcm"];

function PanelCargando() {
  return (
    <div className={cotizadorStyles.panelCargando} role="status">
      <span className={cotizadorStyles.spinner} aria-hidden="true" />
      <span className={cotizadorStyles.avisoTexto}>Cargando…</span>
    </div>
  );
}

const ProformaUpload = dynamic(() => import("./ProformaUpload").then((m) => m.ProformaUpload), {
  ssr: false,
  loading: () => <PanelCargando />,
});
const MaritimoResultado = dynamic(
  () => import("./MaritimoResultado").then((m) => m.MaritimoResultado),
  { ssr: false, loading: () => <PanelCargando /> },
);
const MaritimoQuoteDoc = dynamic(
  () => import("./MaritimoQuoteDoc").then((m) => m.MaritimoQuoteDoc),
  { ssr: false, loading: () => null },
);

type EstadoDeteccion = "idle" | "detecting" | "done" | "error";

interface ManualNcm {
  sim: string;
  die: string;
  te: string;
  iva: string;
}

/** `whatsappContacto` (VGRP-69): `links.whatsapp` de la config, para "Enviar por WhatsApp". */
export function CotizadorMaritimo({ whatsappContacto }: { whatsappContacto: string }) {
  // Paso 1 — posición arancelaria
  const [producto, setProducto] = useState("");
  const [detStatus, setDetStatus] = useState<EstadoDeteccion>("idle");
  const [detError, setDetError] = useState("");
  const [ai, setAi] = useState<IdentificacionNcm | null>(null);
  const [selected, setSelected] = useState<PosicionElegida | null>(null);
  const [manual, setManual] = useState<ManualNcm>({ sim: "", die: "", te: "", iva: "" });
  const [mostrarManual, setMostrarManual] = useState(false);
  const lastQuery = useRef("");
  const runId = useRef(0);
  const getNcmRef = useRef<BuscarNcm | null>(null);
  const getNcm = (sim: string) => getNcmRef.current?.(sim) ?? null;

  // Paso 2 — carga
  const [volumenM3, setVolumenM3] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [unidades, setUnidades] = useState("");
  const [fob, setFob] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [extraido, setExtraido] = useState("");

  // Paso 3 — origen
  const [direccion, setDireccion] = useState("");
  const [puerto, setPuerto] = useState("");
  const [puertoAuto, setPuertoAuto] = useState<{ puerto: string; motivo: string } | null>(null);
  const puertoTocado = useRef(false);
  // Nueva dirección (a mano o desde la proforma) invalida el puerto que el
  // usuario haya elegido a mano: vuelve a sugerirse solo.
  function setDireccionYResetPuerto(v: string) {
    setDireccion(v);
    puertoTocado.current = false;
  }

  // Flete de contenedor completo, si el despachante ya lo cotizó.
  const [fleteFull, setFleteFull] = useState("");

  // Tipo de cambio (CDA)
  const [tc, setTc] = useState("");
  const [tcInfo, setTcInfo] = useState("Buscando la cotización del CDA…");

  const refNumber = useRef(`MAR-${String(Date.now()).slice(-6)}`).current;

  // ── Tipo de cambio del CDA, al montar ───────────────────────────────
  useEffect(() => {
    let vivo = true;
    getDolarCDA()
      .then((d) => {
        const v = Number(d?.venta);
        if (!vivo || !Number.isFinite(v) || v <= 0) return;
        setTc(String(v));
        setTcInfo(`CDA ${d.fecha} · venta ${fmtNum(v, 2)} · compra ${fmtNum(d.compra, 2)}`);
      })
      .catch((e: unknown) => {
        const mensaje = e instanceof Error ? e.message : String(e);
        if (vivo) setTcInfo(`No se pudo leer la cotización del CDA (${mensaje}). Cargala a mano.`);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // ── Puerto sugerido según la dirección del fabricante ───────────────
  useEffect(() => {
    const s = sugerirPuerto(direccion);
    setPuertoAuto(s);
    if (s && !puertoTocado.current) setPuerto(s.puerto);
  }, [direccion]);

  // ── La IA detecta la posición al terminar de escribir el producto ───
  useEffect(() => {
    const q = producto.trim();
    if (q.length < 3 || q === lastQuery.current) return;
    const t = setTimeout(() => detect(q), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto]);

  async function detect(q: string) {
    lastQuery.current = q;
    const id = ++runId.current;
    setDetStatus("detecting");
    setDetError("");
    setAi(null);
    setSelected(null);

    try {
      const [{ searchNCM, searchByPartidas }, base] = await Promise.all([
        import("@/lib/cotizador/ncm/search"),
        import("@/lib/cotizador/ncm/base"),
      ]);
      getNcmRef.current = base.getNcm;

      let sugError: unknown = null;
      const [local, sug] = await Promise.all([
        searchNCM(q, 40),
        suggestPartidas(q).catch((e: unknown) => {
          sugError = e;
          return null;
        }),
      ]);
      if (id !== runId.current) return;

      const candidatos: CandidatoSim[] = [...local];
      if (sug?.partidas?.length) {
        const extra = await searchByPartidas(sug.partidas, 60);
        const vistos = new Set(candidatos.map((c) => c.sim));
        for (const e of extra) {
          if (!vistos.has(e.sim)) {
            candidatos.push(e);
            vistos.add(e.sim);
          }
        }
      }
      const primero = candidatos[0];
      if (!primero) {
        if (sugError) throw sugError;
        throw new Error(
          "No se encontraron posiciones para ese producto. Probá con otras palabras.",
        );
      }

      let record: PosicionElegida | null;
      let aiRes: IdentificacionNcm;
      try {
        const candidatosIdentificacion: CandidatoIdentificacion[] = candidatos.map((c) => ({
          ncm: c.sim,
          descripcion: c.descripcion,
        }));
        aiRes = await identifyNCM(q, candidatosIdentificacion);
        record = getNcm(aiRes.ncm);
      } catch (err) {
        if (err instanceof ErrorApi && (err.status === 401 || err.status === 403)) throw err;
        const mensaje = err instanceof Error ? err.message : String(err);
        aiRes = {
          ncm: primero.sim,
          confianza: 50,
          razonamiento: `IA no disponible (${mensaje}). Se usa la mejor coincidencia textual local.`,
          alternativas: [],
        };
        record = primero;
      }
      if (id !== runId.current) return;
      if (!record) throw new Error("La posición elegida no está en la base local.");

      setAi(aiRes);
      setSelected(record);
      setDetStatus("done");
    } catch (err) {
      if (id !== runId.current) return;
      setDetStatus("error");
      setDetError((err instanceof Error && err.message) || "Error inesperado.");
    }
  }

  // ── Packing list / proforma: completa todo solo ─────────────────────
  function handleExtracted(d: DatosProforma) {
    const puesto: string[] = [];
    const set = (valor: unknown, setter: (v: string) => void, etiqueta: string) => {
      const n = num(valor);
      if (valor != null && n > 0) {
        setter(String(n));
        puesto.push(etiqueta);
      }
    };

    if (d.producto && !producto.trim()) setProducto(d.producto);
    if (d.proveedor) setProveedor(d.proveedor);

    set(d.fob, setFob, "FOB");
    set(d.pesoKg, setPesoKg, "peso");
    set(d.unidades, setUnidades, "unidades");

    // El volumen es el dato que manda en marítimo. Si el packing list no lo
    // trae, se reconstruye con las dimensiones de la caja por la cantidad.
    let m3 = num(d.volumenM3);
    if (m3 <= 0) {
      const { largo, ancho, alto } = d.dimensiones || {};
      const cajas = num(d.cajas);
      const porCaja = (num(largo) * num(ancho) * num(alto)) / 1_000_000; // cm³ → m³
      if (porCaja > 0 && cajas > 0) {
        m3 = porCaja * cajas;
        puesto.push("volumen (calculado de las cajas)");
      }
    } else {
      puesto.push("volumen");
    }
    if (m3 > 0) setVolumenM3(String(Number(m3.toFixed(3))));

    if (d.direccionFabricante) {
      setDireccionYResetPuerto(d.direccionFabricante);
      puesto.push("dirección del fabricante");
    } else if (d.origen) {
      setDireccionYResetPuerto(d.origen);
      puesto.push("origen");
    }

    setExtraido(
      puesto.length
        ? `Se completó: ${puesto.join(" · ")}. Revisá que esté bien.`
        : "No se pudo leer ningún dato del documento. Cargalos a mano.",
    );
  }

  // ── Cálculo ───────────────────────────────────────────────────────
  // Lo cargado a mano pisa lo que detectó la IA; si no hay nada a mano, cae
  // al valor detectado y por último a un default.
  const pick = (manualV: string, detectado: number | undefined, def = 0) =>
    manualV !== "" ? num(manualV) : (detectado ?? def);

  const fiscal: FiscalMaritimo = useMemo(
    () => ({
      sim: manual.sim || selected?.sim || "",
      descripcion: selected?.descripcion || "",
      die: pick(manual.die, selected?.die),
      te: pick(manual.te, selected?.te),
      iva: pick(manual.iva, selected?.iva, 21),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manual.sim, manual.die, manual.te, manual.iva, selected],
  );

  const listo = num(volumenM3) > 0 && num(fob) > 0 && num(tc) > 0;

  const res = useMemo(() => {
    if (!listo) return null;
    return calcAmbas({
      volumenM3,
      pesoKg,
      fob,
      unidades,
      die: fiscal.die,
      te: fiscal.te,
      iva: fiscal.iva,
      tc: num(tc),
      fleteFullUsd: fleteFull || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, volumenM3, pesoKg, fob, unidades, fiscal.die, fiscal.te, fiscal.iva, tc, fleteFull]);

  const puertoSel = PUERTOS.find((p) => p.id === puerto);

  return (
    <div className={cotizadorStyles.cotizador}>
      {/* ── 1. Producto ───────────────────────────────────────────────── */}
      <section className={cotizadorStyles.card} aria-labelledby="maritimo-producto">
        <div className={cotizadorStyles.cardCabecera}>
          <h2 className={cotizadorStyles.cardTitulo} id="maritimo-producto">
            <span className={cotizadorStyles.paso} aria-hidden="true">
              1
            </span>
            Producto
          </h2>
          <p className={cotizadorStyles.cardSubtitulo}>
            Escribí qué se importa. La IA identifica la posición arancelaria en la base oficial
            AFIP/Malvina y de ahí salen los derechos, la estadística y el IVA.
          </p>
        </div>

        <TextField
          label="Descripción del producto"
          value={producto}
          onChange={(e) => setProducto(e.target.value)}
          placeholder="Ej: set de herramientas, mosaicos cerámicos, casas prefabricadas…"
          autoComplete="off"
          hint="Qué es, de qué material y para qué sirve. Mientras más claro, mejor la posición que encuentra la IA."
        />

        <div aria-live="polite">
          {detStatus === "detecting" && (
            <div className={cotizadorStyles.aviso}>
              <span className={cotizadorStyles.spinner} aria-hidden="true" />
              <p className={cotizadorStyles.avisoTexto}>Identificando la posición arancelaria…</p>
            </div>
          )}
          {detStatus === "done" && ai && selected && (
            <p className={cotizadorStyles.srOnly}>
              Posición {selected.sim} seleccionada, con {ai.confianza}% de probabilidad.
            </p>
          )}
        </div>
        {detStatus === "error" && <FormError>{detError}</FormError>}

        {detStatus === "done" && ai && selected && (
          <div className={cotizadorStyles.ncmHit}>
            <div className={cotizadorStyles.ncmCabecera}>
              <span className={cotizadorStyles.ncmCodigo}>{selected.sim}</span>
              <span className={cotizadorStyles.ncmMeta}>
                Probabilidad: <strong>{ai.confianza}%</strong>
              </span>
            </div>
            <p className={cotizadorStyles.ncmDescripcion}>{selected.descripcion}</p>
            <progress
              className={cotizadorStyles.confianza}
              max={100}
              value={ai.confianza}
              aria-hidden="true"
            />
            <div className={cotizadorStyles.alicuotas}>
              <span className={cotizadorStyles.chipCosto}>DIE {selected.die}%</span>
              <span className={cotizadorStyles.chipCosto}>TE {selected.te}%</span>
              <span className={cotizadorStyles.chipOk}>IVA {selected.iva}%</span>
            </div>
            {ai.razonamiento && (
              <p className={cotizadorStyles.razonamiento}>
                <Icon name="idea" size={16} />
                {ai.razonamiento}
              </p>
            )}

            {ai.alternativas?.length > 0 && (
              <div className={cotizadorStyles.alternativas}>
                <p className={cotizadorStyles.alternativasTitulo}>Alternativas</p>
                {ai.alternativas.map((alt) => {
                  const rec = getNcm(alt.ncm);
                  if (!rec) return null;
                  return (
                    <button
                      key={alt.ncm}
                      type="button"
                      className={cotizadorStyles.alternativa}
                      aria-pressed={selected.sim === rec.sim}
                      onClick={() => setSelected(rec)}
                    >
                      <span className={cotizadorStyles.alternativaTexto}>
                        <span>
                          <span className={cotizadorStyles.alternativaCodigo}>{rec.sim}</span> —{" "}
                          {rec.descripcion}
                        </span>
                        {alt.motivo && (
                          <span className={cotizadorStyles.alternativaMotivo}>{alt.motivo}</span>
                        )}
                      </span>
                      <span className={cotizadorStyles.alternativaAlicuotas}>
                        DIE {rec.die}% · TE {rec.te}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className={cotizadorStyles.toggleProforma}
          onClick={() => setMostrarManual((v) => !v)}
          aria-expanded={mostrarManual}
          aria-controls="maritimo-manual"
        >
          {mostrarManual ? "Ocultar carga manual" : "Cargar la posición a mano"}
        </Button>
        {mostrarManual && (
          <div id="maritimo-manual" className={styles.panelManual}>
            <div className={cotizadorStyles.grilla3}>
              <TextField
                label="Posición SIM"
                value={manual.sim}
                onChange={(e) => setManual((s) => ({ ...s, sim: e.target.value }))}
                placeholder="8206.00.00.900"
                hint="El código de aduana del producto, si ya lo sabés (te lo pasa el despachante)."
              />
              <TextField
                label="DIE %"
                inputMode="decimal"
                value={manual.die}
                onChange={(e) => setManual((s) => ({ ...s, die: e.target.value }))}
                placeholder="18"
                hint="Derechos de importación: el arancel de esa posición."
              />
              <TextField
                label="TE %"
                inputMode="decimal"
                value={manual.te}
                onChange={(e) => setManual((s) => ({ ...s, te: e.target.value }))}
                placeholder="3"
                hint="Tasa de estadística de esa posición."
              />
            </div>
            <TextField
              label="IVA %"
              inputMode="decimal"
              value={manual.iva}
              onChange={(e) => setManual((s) => ({ ...s, iva: e.target.value }))}
              placeholder="21"
              hint="IVA de esa posición (casi siempre 21 o 10,5). Lo que cargues acá pisa lo que detecte la IA."
            />
          </div>
        )}
      </section>

      {/* ── 2. Carga ─────────────────────────────────────────────────── */}
      <section className={cotizadorStyles.card} aria-labelledby="maritimo-carga">
        <div className={cotizadorStyles.cardCabecera}>
          <h2 className={cotizadorStyles.cardTitulo} id="maritimo-carga">
            <span className={cotizadorStyles.paso} aria-hidden="true">
              2
            </span>
            Carga
          </h2>
          <p className={cotizadorStyles.cardSubtitulo}>
            Subí el packing list y la proforma y se completa todo solo. Si no los tenés, cargalo a
            mano.
          </p>
        </div>

        <ProformaUpload onExtracted={handleExtracted} />
        {extraido && (
          <div className={cotizadorStyles.aviso} role="status">
            <p className={cotizadorStyles.avisoTexto}>{extraido}</p>
          </div>
        )}

        <div className={cotizadorStyles.grilla3}>
          <TextField
            label="Volumen (m³)"
            inputMode="decimal"
            value={volumenM3}
            onChange={(e) => setVolumenM3(e.target.value)}
            placeholder="8,501"
            hint="Total del embarque. En el packing list figura como CBM, M3 o MEAS."
          />
          <TextField
            label="Peso bruto (kg)"
            inputMode="decimal"
            value={pesoKg}
            onChange={(e) => setPesoKg(e.target.value)}
            placeholder="5500"
            hint="Total con embalaje (gross weight en el packing list)."
          />
          <TextField
            label="Unidades"
            inputMode="decimal"
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
            placeholder="1"
            hint="Cuántos productos vienen en total. Sirve para el costo por unidad."
          />
          <TextField
            label="Valor FOB (USD)"
            inputMode="decimal"
            value={fob}
            onChange={(e) => setFob(e.target.value)}
            placeholder="18000"
            hint="Lo que le pagás al proveedor, puesto en el puerto de origen. Está en la proforma."
          />
        </div>

        {res && (
          <p className={cotizadorStyles.cardSubtitulo}>
            Facturan <strong>{fmtNum(res.consolidado.medidas.wm, 3)} TN/m³</strong> —{" "}
            {res.consolidado.medidas.porVolumen
              ? `manda el volumen (${fmtNum(res.consolidado.medidas.m3, 3)} m³ contra ${fmtNum(res.consolidado.medidas.ton, 3)} t)`
              : `manda el peso (${fmtNum(res.consolidado.medidas.ton, 3)} t contra ${fmtNum(res.consolidado.medidas.m3, 3)} m³)`}
          </p>
        )}
      </section>

      {/* ── 3. Origen ────────────────────────────────────────────────── */}
      <section className={cotizadorStyles.card} aria-labelledby="maritimo-origen">
        <div className={cotizadorStyles.cardCabecera}>
          <h2 className={cotizadorStyles.cardTitulo} id="maritimo-origen">
            <span className={cotizadorStyles.paso} aria-hidden="true">
              3
            </span>
            Origen
          </h2>
          <p className={cotizadorStyles.cardSubtitulo}>
            Poné la dirección del fabricante y se elige el puerto de carga más cercano.
          </p>
        </div>

        <TextField
          label="Dirección del fabricante"
          value={direccion}
          onChange={(e) => setDireccionYResetPuerto(e.target.value)}
          placeholder="Ej: No. 128 Jinshui Road, Jinan, Shandong, China"
          hint="La del exportador (shipper), como figura en la proforma. Con la ciudad y la provincia alcanza."
        />

        {puertoAuto && (
          <div className={cotizadorStyles.aviso} role="status">
            <p className={cotizadorStyles.avisoTexto}>
              Puerto sugerido:{" "}
              <strong>{PUERTOS.find((p) => p.id === puertoAuto.puerto)?.label}</strong> —{" "}
              {puertoAuto.motivo}
            </p>
          </div>
        )}
        {direccion.trim().length > 3 && !puertoAuto && (
          <div className={cotizadorStyles.aviso} role="status">
            <p className={cotizadorStyles.avisoTexto}>
              No pude ubicar esa dirección. Elegí el puerto a mano.
            </p>
          </div>
        )}

        <fieldset className={cotizadorStyles.grupoOpciones}>
          <legend className={cotizadorStyles.leyenda}>Puerto de carga</legend>
          {PUERTOS.map((p) => (
            <label
              key={p.id}
              className={
                puerto === p.id
                  ? `${cotizadorStyles.regimen} ${cotizadorStyles.regimenElegido}`
                  : cotizadorStyles.regimen
              }
            >
              <input
                type="radio"
                name="puerto"
                value={p.id}
                checked={puerto === p.id}
                onChange={() => {
                  puertoTocado.current = true;
                  setPuerto(p.id);
                }}
                className={cotizadorStyles.radio}
              />
              <span className={cotizadorStyles.opcionTexto}>
                <span className={cotizadorStyles.opcionTitulo}>{p.label}</span>
                <span className={cotizadorStyles.opcionDesc}>
                  {p.pais} · {p.transito} días de tránsito
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className={cotizadorStyles.grilla2}>
          <TextField
            label="Puerto de descarga"
            value={`${PUERTO_DESCARGA.label} (${PUERTO_DESCARGA.pais})`}
            readOnly
          />
          <TextField
            label="Proveedor"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Razón social del exportador"
            hint="Opcional. Sale en el PDF."
          />
        </div>

        <div className={cotizadorStyles.grilla2}>
          <TextField
            label="Tipo de cambio aduana (CDA)"
            inputMode="decimal"
            value={tc}
            onChange={(e) => setTc(e.target.value)}
            hint={`El dólar que usa la aduana para calcular los impuestos. ${tcInfo}`}
          />
        </div>
      </section>

      {/* ── 4. Las dos cotizaciones ──────────────────────────────────── */}
      <section
        aria-label="Resultado de la cotización marítima"
        className={cotizadorStyles.resultado}
      >
        {res ? (
          <>
            <MaritimoResultado
              res={res}
              fiscal={fiscal}
              puerto={puertoSel}
              fleteFull={fleteFull}
              setFleteFull={setFleteFull}
              refNumber={refNumber}
              producto={producto}
              whatsappContacto={whatsappContacto}
            />
            <MaritimoQuoteDoc
              refNumber={refNumber}
              fecha={new Date().toLocaleDateString("es-AR")}
              datos={{
                producto,
                proveedor,
                direccion,
                puerto: puertoSel,
                fiscal,
                unidades: num(unidades) || 1,
              }}
              res={res}
            />
          </>
        ) : (
          <div className={cotizadorStyles.aviso}>
            <p className={cotizadorStyles.avisoTexto}>
              Falta cargar{" "}
              {[
                num(volumenM3) > 0 ? null : "volumen",
                num(fob) > 0 ? null : "FOB",
                num(tc) > 0 ? null : "tipo de cambio",
              ]
                .filter(Boolean)
                .join(" · ")}
              .
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
