"use client";

// Port de vegroup@b550803 src/components/AgentQuote.jsx — renombrado a
// CotizadorCourier para no chocar con el cotizador marítimo de VGRP-58.
//
// La lógica, los textos, los pasos y los cálculos son los del original; sólo
// cambia la capa visual (Liquid Glass, ver cotizador.module.css). Desvíos, a
// propósito y chicos:
// - Accesibilidad: régimen y depósito son radio groups reales (fieldset +
//   input radio) en vez de <div onClick>; las alternativas de la IA son
//   <button aria-pressed>; todos los campos tienen label (el producto y las
//   tres medidas no lo tenían visible); los estados de la detección se anuncian
//   en una región `aria-live`; al cotizar, el foco va al resultado.
// - Si el dólar no se pudo traer, además de dejar el campo editable (como el
//   original) se avisa que hay que cargarlo a mano. Nunca se inventa un valor.
// - 401/403 al identificar: no se degrada a "IA no disponible" (el original lo
//   hace sólo con 401) porque lib/cotizador/api.ts ya está sacando al usuario
//   de la página (sesión vencida → /login, sin plan → /comprar).
// - Los paneles de resultados se cargan en diferido (next/dynamic): no se
//   muestran antes de "Cotizar" y así no pesan en la carga inicial de la
//   página (design-vgrp57.md → "Rendimiento y presupuesto de bundle").
// - Por la misma razón, la búsqueda NCM (lib/cotizador/ncm) se importa recién
//   en la primera detección y la carga de proforma recién cuando se abre: con
//   todo estático /calculadora daba 203 kB de First Load, arriba de los
//   200 kB del presupuesto de VGRP-56. Decisión del equipo del 2026-09-28:
//   diferir en vez de subir el presupuesto.

import dynamic from "next/dynamic";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import {
  type DatosProforma,
  ErrorApi,
  getDolarBNA,
  type IdentificacionNcm,
  identifyNCM,
  type RespuestaDolar,
  type ResumenCostos,
  suggestPartidas,
} from "@/lib/cotizador/api";
import {
  calcAllIntegral,
  calcAllRoutes,
  fmtARS,
  fmtUSD,
  INTEGRAL_THRESHOLD,
  INTEGRAL_VOL_RATE,
  PE_LIMITS,
  PEQUEÑOS_ENVIOS,
  ROUTES,
} from "@/lib/cotizador/calc";
import type {
  CandidatoSim,
  PosicionElegida,
  Regimen,
  ResultadoIntegrales,
  ResultadoRutas,
  RutaId,
} from "@/lib/cotizador/types";
import { textoCourier, textoIntegral } from "@/lib/cotizador/whatsappCourier";
import { linkWhatsappVegroup } from "@/lib/cotizador/whatsappVegroup";
import styles from "./cotizador.module.css";

/** `getNcm` de lib/cotizador/ncm/base, que se importa en diferido (ver arriba). */
type BuscarNcm = typeof import("@/lib/cotizador/ncm/base")["getNcm"];

// ── Paneles de resultados, en diferido ───────────────────────────────────
// Sólo se montan cuando hay un resultado (después de "Cotizar").
//
// `PanelCargando` y el flujo de detección de NCM (más abajo) se probaron
// como código compartido con CotizadorMaritimo (lib/cotizador/useDeteccionNcm.ts,
// components/cotizador/PanelCargando.tsx) en el pase de /simplify, pero
// compartir con el componente marítimo (que se carga en diferido) agrega ese
// código al chunk estático de /calculadora — que ya está en el límite del
// presupuesto de bundle (B12-14). Se revirtió a duplicado a propósito: acá
// "no repetirse" pierde contra "no romper el presupuesto de CI".

function PanelCargando() {
  return (
    <div className={styles.panelCargando} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.avisoTexto}>Cargando…</span>
    </div>
  );
}

const RouteBreakdown = dynamic(() => import("./RouteBreakdown").then((m) => m.RouteBreakdown), {
  ssr: false,
  loading: () => <PanelCargando />,
});
const PriceStrategy = dynamic(() => import("./PriceStrategy").then((m) => m.PriceStrategy), {
  ssr: false,
  loading: () => <PanelCargando />,
});
const MarketingAnalysis = dynamic(
  () => import("./MarketingAnalysis").then((m) => m.MarketingAnalysis),
  { ssr: false, loading: () => <PanelCargando /> },
);
// Sólo se monta cuando el usuario abre "Subir proforma".
const ProformaUpload = dynamic(() => import("./ProformaUpload").then((m) => m.ProformaUpload), {
  ssr: false,
  loading: () => <PanelCargando />,
});
// "Identificar con una foto": no pesa hasta que se monta el paso 1.
const FotoProducto = dynamic(() => import("./FotoProducto").then((m) => m.FotoProducto), {
  ssr: false,
  loading: () => null,
});
// Invisible en pantalla (sólo se ve al imprimir): sin placeholder.
const QuoteDoc = dynamic(() => import("./QuoteDoc").then((m) => m.QuoteDoc), {
  ssr: false,
  loading: () => null,
});

// ── Tipos locales ────────────────────────────────────────────────────────

type EstadoDeteccion = "idle" | "detecting" | "done" | "error";

interface CamposForm {
  fob: string;
  pesoKg: string;
  unidades: string;
  largo: string;
  ancho: string;
  alto: string;
  cajas: string;
  dolarBN: string;
  dolarCCL: string;
}

/** `results` del original, discriminado por motor para que TS sepa qué shape tiene. */
type Resultado =
  | { tipo: "integral"; data: ResultadoIntegrales }
  | { tipo: "rutas"; data: ResultadoRutas };

// VGRP-69 — ayuda de los campos que se repiten entre regímenes. Corta a
// propósito: este componente viaja en el chunk estático de /calculadora, al
// límite del presupuesto (B12-14).
const AYUDA = {
  fob: "Lo que le pagás al proveedor por la mercadería, sin flete. Está en la factura o proforma.",
  peso: "Peso total con las cajas, en balanza. Ej: 4,5.",
  unidades: "Cuántos productos vienen en total, sumando todas las cajas.",
};

const OPCIONES_REGIMEN: readonly { id: Regimen; titulo: string; desc: string }[] = [
  {
    id: "integral",
    titulo: "Courier integral",
    desc: "Todo incluido · tarifa por kg · sin aranceles",
  },
  {
    id: "pequeños",
    titulo: "Pequeños envíos",
    desc: `FOB ≤ US$ ${PE_LIMITS.maxFob} · hasta ${PE_LIMITS.maxUnidades} unidades · franquicia`,
  },
  {
    id: "general",
    titulo: "Courier comercial",
    desc: "Cualquier monto · detección automática de NCM",
  },
];

// ─────────────────────────────────────────────────────────────────────────
// COTIZADOR VEGROUP — flujo definido por el usuario (del original):
//   1. El usuario escribe el producto.
//   2. La IA detecta sola la posición NCM correcta (sin apretar nada).
//   3. Se muestra y selecciona la de mayor probabilidad (con su %).
//   4. El usuario carga FOB, peso, dimensiones y elige el depósito
//      (Miami / Barcelona / China, cada uno con su dirección).
//   5. Presiona COTIZAR y sale el resumen completo.
// ─────────────────────────────────────────────────────────────────────────
// VGRP-77 — `bloqueado`: la calculadora de fondo, borrosa e inerte, de quien no
// tiene plan. No pide el dólar al montar: el endpoint contesta 403 y
// `lib/cotizador/api.ts` reacciona a eso mandando a `/comprar`, o sea que se
// lo llevaba de la página a los pocos segundos.
//
// "Enviar por WhatsApp" y el pie del PDF van al número de VEGROUP
// (lib/cotizador/whatsappVegroup.ts): ya no dependen de `links.whatsapp`.
export function CotizadorCourier({ bloqueado = false }: { bloqueado?: boolean }) {
  const [regimen, setRegimen] = useState<Regimen>("general");
  const [producto, setProducto] = useState("");
  const [form, setForm] = useState<CamposForm>({
    fob: "",
    pesoKg: "",
    unidades: "",
    largo: "",
    ancho: "",
    alto: "",
    cajas: "1",
    dolarBN: "",
    dolarCCL: "",
  });
  const [deposito, setDeposito] = useState<RutaId | null>(null); // id de ruta elegida
  const [dolarInfo, setDolarInfo] = useState<RespuestaDolar | null>(null);
  const [dolarFallo, setDolarFallo] = useState(false);
  const [showProforma, setShowProforma] = useState(false);
  const [editandoTC, setEditandoTC] = useState(false);

  // Detección automática de NCM.
  const [detStatus, setDetStatus] = useState<EstadoDeteccion>("idle");
  const [detError, setDetError] = useState("");
  const [ai, setAi] = useState<IdentificacionNcm | null>(null);
  const [selected, setSelected] = useState<PosicionElegida | null>(null); // registro SIM elegido
  const lastQuery = useRef("");
  const runId = useRef(0);
  // `getNcm` queda acá después de la primera detección. Las alternativas y
  // pickAlternative sólo existen con una detección terminada, así que para
  // cuando se leen ya está cargado.
  const getNcmRef = useRef<BuscarNcm | null>(null);
  const getNcm = (sim: string) => getNcmRef.current?.(sim) ?? null;

  const [results, setResults] = useState<Resultado | null>(null); // se genera al presionar COTIZAR
  const [refNumber, setRefNumber] = useState("");
  const resultadoRef = useRef<HTMLElement>(null);

  const set = (field: keyof CamposForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [field]: e.target.value }));

  // Cambio de régimen: setea o limpia la NCM fija.
  useEffect(() => {
    setResults(null);
    if (regimen === "pequeños") {
      setSelected(PEQUEÑOS_ENVIOS);
      setDetStatus("done");
      setAi(null);
      setDetError("");
    } else if (regimen === "integral") {
      setSelected(null);
      setDetStatus("idle");
      setAi(null);
      setDetError("");
    } else {
      setSelected(null);
      setDetStatus("idle");
      setAi(null);
      lastQuery.current = "";
    }
  }, [regimen]);

  // TC BNA automático al entrar (editable por si la fuente falla).
  useEffect(() => {
    if (bloqueado) return;
    let alive = true;
    getDolarBNA()
      .then((d) => {
        if (!alive) return;
        setDolarInfo(d);
        setForm((s) => ({
          ...s,
          dolarBN: s.dolarBN === "" ? String(d.venta) : s.dolarBN,
          dolarCCL: s.dolarCCL === "" && d.ccl ? String(d.ccl.venta) : s.dolarCCL,
        }));
      })
      .catch(() => {
        // Sin valor inventado: el campo queda vacío y editable, con aviso.
        if (alive) setDolarFallo(true);
      });
    return () => {
      alive = false;
    };
  }, [bloqueado]);

  // 2) La IA arranca sola cuando el usuario termina de escribir el producto.
  useEffect(() => {
    if (regimen !== "general") return;
    const q = producto.trim();
    if (q.length < 3 || q === lastQuery.current) return;
    const t = setTimeout(() => detect(q), 900);
    return () => clearTimeout(t);
  }, [producto, regimen]);

  async function detect(q: string) {
    lastQuery.current = q;
    const id = ++runId.current;
    setDetStatus("detecting");
    setDetError("");
    setAi(null);
    setSelected(null);
    setResults(null);

    try {
      const [{ searchNCM, searchByPartidas }, base] = await Promise.all([
        import("@/lib/cotizador/ncm/search"),
        import("@/lib/cotizador/ncm/base"),
      ]);
      getNcmRef.current = base.getNcm;
      let sugError: unknown = null;
      let [local, sug] = await Promise.all([
        searchNCM(q, 40),
        suggestPartidas(q).catch((e: unknown) => {
          sugError = e;
          return null;
        }),
      ]);
      if (!sug && local.length === 0) {
        sug = await suggestPartidas(q).catch((e: unknown) => {
          sugError = e;
          return null;
        });
      }
      if (id !== runId.current) return; // llegó una búsqueda más nueva

      const candidates: CandidatoSim[] = [...local];
      if (sug?.partidas?.length) {
        const extra = await searchByPartidas(sug.partidas, 60);
        const seen = new Set(candidates.map((c) => c.sim));
        for (const e of extra) {
          if (!seen.has(e.sim)) {
            candidates.push(e);
            seen.add(e.sim);
          }
        }
      }
      const primero = candidates[0];
      if (!primero) {
        if (sugError) throw sugError;
        throw new Error(
          "No se encontraron posiciones para ese producto. Probá con otras palabras.",
        );
      }

      let record: PosicionElegida | null;
      let aiRes: IdentificacionNcm;
      try {
        aiRes = await identifyNCM(
          q,
          candidates.map((c) => ({ ncm: c.sim, descripcion: c.descripcion })),
        );
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

      // 3) Se muestra y queda seleccionada la de mayor probabilidad.
      setAi(aiRes);
      setSelected(record);
      setDetStatus("done");
    } catch (err) {
      if (id !== runId.current) return;
      setDetStatus("error");
      setDetError((err instanceof Error && err.message) || "Error inesperado.");
    }
  }

  const datosCompletos =
    regimen === "integral"
      ? Number(form.pesoKg) > 0 &&
        Number(form.largo) > 0 &&
        Number(form.ancho) > 0 &&
        Number(form.alto) > 0
      : Number(form.fob) > 0 &&
        Number(form.pesoKg) > 0 &&
        Number(form.unidades) > 0 &&
        Number(form.largo) > 0 &&
        Number(form.ancho) > 0 &&
        Number(form.alto) > 0;

  const pequeñosOk =
    regimen !== "pequeños" ||
    (Number(form.fob) <= PE_LIMITS.maxFob && Number(form.unidades) <= PE_LIMITS.maxUnidades);

  const ready =
    regimen === "integral"
      ? datosCompletos && deposito !== null
      : detStatus === "done" &&
        selected !== null &&
        datosCompletos &&
        deposito !== null &&
        pequeñosOk;

  const cajas = Math.max(1, Math.round(Number(form.cajas) || 1));

  // 5) COTIZAR: se calcula y se muestra el resumen del depósito elegido.
  function handleQuote(e?: FormEvent) {
    e?.preventDefault();
    if (!ready) return;
    const inp = {
      pesoKg: form.pesoKg,
      cajas,
      largo: form.largo,
      ancho: form.ancho,
      alto: form.alto,
      unidades: form.unidades || "1",
      dolarBN: form.dolarBN,
      dolarCCL: form.dolarCCL,
    };
    if (regimen === "integral") {
      setResults({ tipo: "integral", data: calcAllIntegral(inp) });
    } else {
      if (!selected) return;
      setResults({
        tipo: "rutas",
        data: calcAllRoutes({
          ...inp,
          fob: form.fob,
          die: selected.die,
          te: selected.te,
          iva: selected.iva,
          impInternosNom: selected.impInternos,
        }),
      });
    }
    const d = new Date();
    setRefNumber(
      `OG-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`,
    );
    requestAnimationFrame(() => {
      const el = resultadoRef.current;
      if (!el) return;
      const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
      el.focus({ preventScroll: true });
    });
  }

  // `currentResult` del original, uno por motor.
  const integralActual =
    results?.tipo === "integral" && deposito
      ? (results.data.results.find((x) => x.route === deposito) ?? null)
      : null;
  const rutaActual =
    results?.tipo === "rutas" && deposito
      ? (results.data.results.find((x) => x.route === deposito) ?? null)
      : null;

  // Resumen de texto para mandarle a VEGROUP por WhatsApp (lib/cotizador/whatsappCourier.ts).
  function whatsappText(): string {
    if (regimen === "integral") {
      if (!integralActual) return "";
      return textoIntegral({
        refNumber,
        producto,
        form: { ...form, cajas },
        result: integralActual,
        dolarBN: Number(form.dolarBN) > 0 ? Number(form.dolarBN) : null,
      });
    }
    if (!rutaActual || !selected) return "";
    return textoCourier({
      refNumber,
      regimen,
      producto,
      selected,
      form: { ...form, cajas },
      result: rutaActual,
    });
  }

  const resumenCostos = useMemo<ResumenCostos | null>(() => {
    if (results?.tipo !== "rutas" || !deposito || regimen === "integral") return null;
    const r = results.data.results.find((x) => x.route === deposito);
    if (!r) return null;
    return {
      rutaMasConveniente: r.label,
      costoRealEfectivo: Number(r.costoRealEfectivo.toFixed(2)),
      costoPorUnidad: Number(r.costoPorUnidad.toFixed(2)),
      unidades: r.unidades,
      monedaCosto: "USD",
    };
  }, [results, deposito, regimen]);

  // Costo real puesto en mano (USD → ARS con el TC del día) para arrancar
  // la calculadora de estrategia de venta con el número que ya resolvió
  // la calculadora madre.
  const costoPorUnidadARS = useMemo<number | null>(() => {
    if (results?.tipo !== "rutas" || !deposito || regimen === "integral") return null;
    const r = results.data.results.find((x) => x.route === deposito);
    if (!r || r.totalPesos == null) return null;
    return r.totalPesos / r.unidades;
  }, [results, deposito, regimen]);

  function handleExtracted(d: DatosProforma) {
    if (d.producto) setProducto(d.producto);
    setForm((s) => ({
      ...s,
      fob: numStr(d.fob) ?? s.fob,
      pesoKg: numStr(d.pesoKg) ?? s.pesoKg,
      cajas: numStr(d.cajas) ?? s.cajas,
      unidades: numStr(d.unidades) ?? s.unidades,
      largo: numStr(d.dimensiones?.largo) ?? s.largo,
      ancho: numStr(d.dimensiones?.ancho) ?? s.ancho,
      alto: numStr(d.dimensiones?.alto) ?? s.alto,
    }));
    setShowProforma(false);
  }

  function pickAlternative(sim: string) {
    const rec = getNcm(sim);
    if (rec) {
      setSelected(rec);
      setResults(null);
    }
  }

  const whatsappHref = linkWhatsappVegroup(whatsappText());
  const fechaDolar = dolarInfo?.fecha
    ? ` · ${new Date(dolarInfo.fecha).toLocaleDateString("es-AR")}`
    : "";
  const fechaCcl = dolarInfo?.ccl?.fecha
    ? ` · ${new Date(dolarInfo.ccl.fecha).toLocaleDateString("es-AR")}`
    : "";

  return (
    <div className={styles.cotizador}>
      {/* ── Selector de régimen ─────────────────────────────────────────── */}
      <div className={styles.regimenes}>
        <fieldset className={styles.grupoOpciones}>
          <legend className={styles.srOnly}>Régimen de importación</legend>
          {OPCIONES_REGIMEN.map((op) => (
            <label
              key={op.id}
              className={
                regimen === op.id ? `${styles.regimen} ${styles.regimenElegido}` : styles.regimen
              }
            >
              <input
                type="radio"
                name="regimen"
                value={op.id}
                checked={regimen === op.id}
                onChange={() => setRegimen(op.id)}
                className={styles.radio}
              />
              <span className={styles.opcionTexto}>
                <span className={styles.opcionTitulo}>{op.titulo}</span>
                {/* A la vista sólo la del elegido (debajo); acá, para lectores de pantalla. */}
                <span className={styles.srOnly}>. {op.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className={styles.regimenDesc} aria-hidden="true">
          {OPCIONES_REGIMEN.find((op) => op.id === regimen)?.desc}
        </p>
      </div>

      {/* ── 1. Producto → la IA detecta la NCM sola ─────────────────────── */}
      {regimen !== "integral" && (
        <section className={styles.card} aria-labelledby="cotizador-producto">
          <div className={styles.cardCabecera}>
            <h2 className={styles.cardTitulo} id="cotizador-producto">
              <span className={styles.paso} aria-hidden="true">
                1
              </span>
              Producto
            </h2>
            <p className={styles.cardSubtitulo}>
              {regimen === "pequeños"
                ? "La posición arancelaria se asigna sola (régimen de pequeños envíos)."
                : "La IA detecta la posición arancelaria en la base oficial AFIP/Malvina."}
            </p>
          </div>

          {regimen === "general" && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.toggleProforma}
              onClick={() => setShowProforma((v) => !v)}
              aria-expanded={showProforma}
              aria-controls="cotizador-proforma"
            >
              <Icon name="documento" size={16} />
              {showProforma ? "Ocultar proforma" : "Subir proforma / packing list (autocompleta)"}
            </Button>
          )}
          {showProforma && regimen === "general" && (
            <ProformaUpload id="cotizador-proforma" onExtracted={handleExtracted} />
          )}

          <TextField
            label="Descripción del producto"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Ej: zapas, gimbal, auriculares bluetooth, celu…"
            autoComplete="off"
            hint="Qué es y para qué sirve, con tus palabras. Mientras más claro, mejor la posición que encuentra la IA."
          />
          <FotoProducto descripcionActual={producto} onDescripcion={setProducto} />

          {/* ── Pequeños envíos: NCM fija ─────────────────────────────────── */}
          {regimen === "pequeños" && selected && (
            <div className={styles.ncmHit}>
              <div className={styles.ncmCabecera}>
                <span className={styles.ncmCodigo}>{selected.sim}</span>
                <span className={styles.ncmMeta}>Régimen simplificado · franquicia</span>
              </div>
              <p className={styles.ncmDescripcion}>{selected.descripcion}</p>
              <div className={styles.alicuotas}>
                <span className={styles.chipOk}>DIE {selected.die}%</span>
                <span className={styles.chipOk}>TE {selected.te}%</span>
                <span className={styles.chipOk}>IVA {selected.iva}%</span>
              </div>
            </div>
          )}

          {/* ── Courier comercial (régimen general): detección con IA ──────── */}
          {regimen === "general" && (
            <div aria-live="polite">
              {detStatus === "detecting" && (
                <div className={styles.aviso}>
                  <span className={styles.spinner} aria-hidden="true" />
                  <p className={styles.avisoTexto}>
                    La IA está detectando la posición arancelaria…
                  </p>
                </div>
              )}
              {detStatus === "done" && ai && selected && (
                <p className={styles.srOnly}>
                  Posición {selected.sim} seleccionada, con {ai.confianza}% de probabilidad.
                </p>
              )}
            </div>
          )}
          {regimen === "general" && detStatus === "error" && <FormError>{detError}</FormError>}

          {regimen === "general" && detStatus === "done" && ai && selected && (
            <div className={styles.ncmHit}>
              <div className={styles.ncmCabecera}>
                <span className={styles.ncmCodigo}>{selected.sim}</span>
                <span className={styles.ncmMeta}>
                  Probabilidad: <strong>{ai.confianza}%</strong> · seleccionada
                </span>
              </div>
              <p className={styles.ncmDescripcion}>{selected.descripcion}</p>
              <progress
                className={styles.confianza}
                max={100}
                value={ai.confianza}
                aria-hidden="true"
              />
              <div className={styles.alicuotas}>
                <span className={styles.chipCosto}>DIE {selected.die}%</span>
                <span className={styles.chipCosto}>TE {selected.te}%</span>
                <span className={styles.chipOk}>IVA {selected.iva}%</span>
                {Number(selected.impInternos) > 0 && (
                  <span className={styles.chipCosto}>II {selected.impInternos}%</span>
                )}
              </div>
              {ai.razonamiento && (
                <p className={styles.razonamiento}>
                  <Icon name="idea" size={16} />
                  {ai.razonamiento}
                </p>
              )}

              {ai.alternativas?.length > 0 && (
                <div className={styles.alternativas}>
                  <p className={styles.alternativasTitulo}>Alternativas</p>
                  {ai.alternativas.map((alt) => {
                    const rec = getNcm(alt.ncm);
                    if (!rec) return null;
                    return (
                      <button
                        key={alt.ncm}
                        type="button"
                        className={styles.alternativa}
                        aria-pressed={selected.sim === rec.sim}
                        onClick={() => pickAlternative(rec.sim)}
                      >
                        <span className={styles.alternativaTexto}>
                          <span>
                            <span className={styles.alternativaCodigo}>{rec.sim}</span> —{" "}
                            {rec.descripcion}
                          </span>
                          {alt.motivo && (
                            <span className={styles.alternativaMotivo}>{alt.motivo}</span>
                          )}
                        </span>
                        <span className={styles.alternativaAlicuotas}>
                          DIE {rec.die}% · TE {rec.te}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Datos del envío + depósito ─────────────────────────────────── */}
      <section className={styles.card} aria-labelledby="cotizador-envio">
        <div className={styles.cardCabecera}>
          <h2 className={styles.cardTitulo} id="cotizador-envio">
            <span className={styles.paso} aria-hidden="true">
              {regimen === "integral" ? "1" : "2"}
            </span>
            {regimen === "integral" ? "Courier integral — todo incluido" : "Datos del envío"}
          </h2>
          <p className={styles.cardSubtitulo}>
            {regimen === "integral"
              ? "Tarifa neta por kg, sin impuestos ni aranceles. Solo peso y volumen."
              : "Datos del paquete y depósito de envío."}
          </p>
        </div>

        <form className={styles.form} onSubmit={handleQuote}>
          {regimen !== "integral" && (
            <div className={`${styles.grilla3} ${styles.ayudaFoco}`}>
              <TextField
                label="Precio FOB (USD)"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.fob}
                onChange={set("fob")}
                placeholder="0.00"
                hint={AYUDA.fob}
              />
              <TextField
                label="Peso del paquete (kg)"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.pesoKg}
                onChange={set("pesoKg")}
                placeholder="0"
                hint={AYUDA.peso}
              />
              <TextField
                label="Unidades totales"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.unidades}
                onChange={set("unidades")}
                placeholder="1"
                hint={AYUDA.unidades}
              />
            </div>
          )}

          {regimen === "integral" && (
            <div className={`${styles.grilla2} ${styles.ayudaFoco}`}>
              <TextField
                label="Peso del paquete (kg)"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.pesoKg}
                onChange={set("pesoKg")}
                placeholder="0"
                hint={AYUDA.peso}
              />
              <TextField
                label="Unidades (opcional)"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.unidades}
                onChange={set("unidades")}
                placeholder="1"
                hint="Solo para calcular el costo por unidad."
              />
            </div>
          )}

          <div className={`${styles.filaMedidas} ${styles.ayudaFoco}`}>
            <fieldset className={styles.grupoCampos} aria-describedby="cotizador-medidas-ayuda">
              <legend className={styles.leyenda}>Dimensiones por caja (cm)</legend>
              <div className={styles.medidas}>
                <TextField
                  label="Largo"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.largo}
                  onChange={set("largo")}
                  placeholder="Largo"
                />
                <TextField
                  label="Ancho"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.ancho}
                  onChange={set("ancho")}
                  placeholder="Ancho"
                />
                <TextField
                  label="Alto"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={form.alto}
                  onChange={set("alto")}
                  placeholder="Alto"
                />
              </div>
              <p className={styles.ayuda} id="cotizador-medidas-ayuda">
                De una caja, con cinta métrica. Si la caja abulta más de lo que pesa, se cobra el
                peso volumétrico.
              </p>
            </fieldset>
            <TextField
              label="Cajas / bultos"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={form.cajas}
              onChange={set("cajas")}
              placeholder="1"
              hint="Cuántas cajas de esa medida mandás."
            />
          </div>

          {/* El dólar viene solo del servidor: se muestra como dato y los campos
              sólo aparecen para editarlo (o si la cotización automática falló). */}
          {!editandoTC && !dolarFallo && (
            <div className={styles.tipoCambio}>
              <p className={styles.tipoCambioTexto}>
                {dolarInfo ? (
                  <>
                    Dólar BNA <strong>${form.dolarBN || dolarInfo.venta}</strong>
                    {regimen !== "integral" && form.dolarCCL !== "" && (
                      <>
                        {" "}
                        · CCL <strong>${form.dolarCCL}</strong>
                      </>
                    )}
                    {fechaDolar}
                  </>
                ) : (
                  "Cargando el dólar del día…"
                )}
              </p>
              {dolarInfo && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditandoTC(true)}>
                  Editar
                </Button>
              )}
            </div>
          )}
          {(editandoTC || dolarFallo) && (
            <div className={`${styles.grilla2} ${styles.ayudaFoco}`}>
              <TextField
                label={`TC BNA (destino)${fechaDolar}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.dolarBN}
                onChange={set("dolarBN")}
                placeholder={
                  dolarInfo ? String(dolarInfo.venta) : dolarFallo ? "Cargalo a mano" : "Cargando…"
                }
                hint="Dólar oficial del Banco Nación: con este se pagan los impuestos y gastos acá."
              />
              {regimen !== "integral" && (
                <TextField
                  label={`TC CCL / Cripto (proveedor)${fechaCcl}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.dolarCCL}
                  onChange={set("dolarCCL")}
                  placeholder={dolarInfo?.ccl ? String(dolarInfo.ccl.venta) : "Cargá manualmente"}
                  hint="Dólar con el que le pagás al proveedor afuera (CCL o cripto)."
                />
              )}
            </div>
          )}
          {dolarFallo && (
            <div className={styles.aviso} role="status">
              <p className={styles.avisoTexto}>
                No pudimos traer la cotización del dólar. Cargala a mano para cotizar.
              </p>
            </div>
          )}

          <fieldset className={styles.grupoOpciones}>
            <legend className={styles.leyenda}>¿A qué depósito enviás?</legend>
            {ROUTES.map((r) => (
              <label
                key={r.id}
                className={deposito === r.id ? styles.depositoElegido : styles.deposito}
              >
                <input
                  type="radio"
                  name="deposito"
                  value={r.id}
                  checked={deposito === r.id}
                  onChange={() => setDeposito(r.id)}
                  className={styles.radio}
                />
                <span className={styles.opcionTexto}>
                  <span className={styles.opcionTitulo}>{r.label}</span>
                  <span className={styles.depositoDireccion}>
                    <Icon name="ubicacion" size={14} />
                    {r.direccion}
                  </span>
                  {regimen === "integral" ? (
                    <span className={styles.depositoTarifa}>
                      ≥{INTEGRAL_THRESHOLD} kg: US$ {r.integral.mayor}/kg · &lt;
                      {INTEGRAL_THRESHOLD} kg: US$ {r.integral.menor}/kg · {r.tiempoEstimado}
                    </span>
                  ) : (
                    <span className={styles.depositoTarifa}>
                      Flete US$ {r.freightPerKg}/kg · {r.tiempoEstimado}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>

          {regimen === "pequeños" &&
            Number(form.fob) > PE_LIMITS.maxFob &&
            Number(form.fob) > 0 && (
              <FormError>
                El FOB supera US$ {PE_LIMITS.maxFob}. Este envío no califica para pequeños envíos —
                usá el régimen general.
              </FormError>
            )}
          {regimen === "pequeños" && Number(form.unidades) > PE_LIMITS.maxUnidades && (
            <FormError>
              Más de {PE_LIMITS.maxUnidades} unidades. Este envío no califica para pequeños envíos —
              usá el régimen general.
            </FormError>
          )}

          <div className={styles.acciones}>
            <Button type="submit" fullWidth disabled={!ready}>
              Cotizar
            </Button>
            {detStatus === "done" && !deposito && datosCompletos && (
              <p className={styles.ayuda}>Elegí un depósito para cotizar.</p>
            )}
          </div>
        </form>
      </section>

      {/* ── Resumen ──────────────────────────────────────────────────── */}
      <section
        id="agente-resultado"
        ref={resultadoRef}
        tabIndex={-1}
        aria-label="Resultado de la cotización"
        className={styles.resultado}
      >
        {results?.tipo === "integral" && deposito && regimen === "integral" && integralActual && (
          <>
            <div className={styles.card}>
              <div className={styles.cardCabecera}>
                <h2 className={styles.cardTitulo}>
                  <span className={styles.paso} aria-hidden="true">
                    2
                  </span>
                  Resumen — Courier integral · {integralActual.label}
                </h2>
                <p className={styles.cardSubtitulo}>
                  Tarifa todo incluido. Tiempo estimado {integralActual.tiempoEstimado}.
                </p>
              </div>

              <ul className={styles.desglose}>
                <li className={styles.linea}>
                  <span>
                    Peso real · {fmtUSD(integralActual.rate)}/kg (
                    {integralActual.pesoReal >= INTEGRAL_THRESHOLD
                      ? `≥${INTEGRAL_THRESHOLD} kg`
                      : `<${INTEGRAL_THRESHOLD} kg`}
                    )
                  </span>
                  <span className={styles.lineaMonto}>{fmtUSD(integralActual.base)}</span>
                </li>
                {integralActual.excesoVol > 0 && (
                  <li className={styles.linea}>
                    <span>
                      Volumétrico excedente · {integralActual.excesoVol.toFixed(1)} kg ×{" "}
                      {fmtUSD(INTEGRAL_VOL_RATE)}/kg
                    </span>
                    <span className={styles.lineaMonto}>{fmtUSD(integralActual.volCost)}</span>
                  </li>
                )}
              </ul>

              {integralActual.excesoVol > 0 && (
                <div className={styles.aviso}>
                  <p className={styles.avisoTexto}>
                    Peso volumétrico ({integralActual.pesoVolumetrico.toFixed(1)} kg) supera al real
                    ({integralActual.pesoReal.toFixed(1)} kg). Excedente:{" "}
                    {integralActual.excesoVol.toFixed(1)} kg.
                  </p>
                </div>
              )}

              <dl className={styles.total}>
                <div className={styles.totalItem}>
                  <dt className={styles.totalClave}>Total USD</dt>
                  <dd className={styles.totalDestacado}>{fmtUSD(integralActual.totalUSD)}</dd>
                </div>
                {integralActual.totalPesos != null && (
                  <div className={styles.totalItem}>
                    <dt className={styles.totalClave}>Total en pesos</dt>
                    <dd className={styles.totalValor}>{fmtARS(integralActual.totalPesos)}</dd>
                  </div>
                )}
                <div className={styles.totalItem}>
                  <dt className={styles.totalClave}>Costo por kg</dt>
                  <dd className={styles.totalValor}>{fmtUSD(integralActual.costoPorKg)}</dd>
                </div>
                {Number(form.unidades) > 0 && (
                  <div className={styles.totalItem}>
                    <dt className={styles.totalClave}>Costo por unidad</dt>
                    <dd className={styles.totalValor}>{fmtUSD(integralActual.costoPorUnidad)}</dd>
                  </div>
                )}
              </dl>

              {(() => {
                const otras = results.data.results.filter((r) => r.route !== integralActual.route);
                return (
                  otras.length > 0 && (
                    <p className={styles.referencia}>
                      Referencia otras rutas:{" "}
                      {otras.map((r, i) => (
                        <span key={r.route}>
                          {i > 0 && " · "}
                          {r.label} {fmtUSD(r.totalUSD)} ({r.tiempoEstimado})
                        </span>
                      ))}
                    </p>
                  )
                );
              })()}
            </div>

            <div className={styles.barraAcciones}>
              <a
                className={styles.linkWhatsapp}
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="mensaje" size={18} />
                Enviar por WhatsApp
              </a>
              <span className={styles.numeroCotizacion}>Cotización N° {refNumber}</span>
            </div>
          </>
        )}

        {results?.tipo === "rutas" && deposito && regimen !== "integral" && (
          <>
            <RouteBreakdown data={results.data} routeId={deposito} />

            <div className={styles.barraAcciones}>
              <Button onClick={() => window.print()}>
                <Icon name="documento" size={18} />
                Descargar PDF
              </Button>
              <a
                className={styles.linkWhatsapp}
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="mensaje" size={18} />
                Enviar por WhatsApp
              </a>
              <span className={styles.numeroCotizacion}>
                Cotización N° {refNumber} — el PDF se genera con el diálogo de impresión (elegí
                "Guardar como PDF").
              </span>
            </div>

            <PriceStrategy
              costoInicial={costoPorUnidadARS}
              unidadesInicial={resumenCostos?.unidades}
            />

            <MarketingAnalysis
              producto={producto}
              ncm={selected?.sim}
              resumenCostos={resumenCostos}
            />
          </>
        )}
      </section>

      {/* Documento imprimible (solo visible al imprimir / guardar PDF). El
          original lo monta siempre y devuelve null sin resultado; acá se monta
          recién con resultado, para no bajar su chunk antes de tiempo. */}
      {regimen !== "integral" && rutaActual && selected && (
        <QuoteDoc
          refNumber={refNumber}
          fecha={new Date().toLocaleDateString("es-AR")}
          producto={producto}
          selected={selected}
          result={rutaActual}
          form={{ ...form, cajas }}
          regimen={regimen}
        />
      )}
    </div>
  );
}

function numStr(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}
