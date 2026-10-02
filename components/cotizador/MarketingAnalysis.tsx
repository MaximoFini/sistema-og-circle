"use client";

// VGRP-57 — ex vegroup@b550803 src/components/MarketingAnalysis.jsx, en
// Liquid Glass. Mismas secciones, textos y comportamiento, SIN `LeadGate`: el
// usuario ya está logueado y con plan, no se le pide nombre ni WhatsApp
// (requirements US-6). Lo carga CotizadorCourier con next/dynamic.
//
// El análisis llega en streaming: los bloques se van llenando a medida que el
// modelo escribe, y los que todavía no empezaron muestran un esqueleto. Al
// terminar, lo que queda es el análisis definitivo que validó el servidor.
//
// Si la IA falla: el error se muestra con FormError y un "Reintentar" que
// vuelve a pedir el análisis con el mismo contexto. La cotización no se toca
// (vive en CotizadorCourier) y, como en el original, un análisis anterior
// completo vuelve a quedar a la vista (lo escrito a medias se descarta).

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { type AnalisisMarketing, analyzeProduct, type ResumenCostos } from "@/lib/cotizador/api";
import styles from "./MarketingAnalysis.module.css";

const SIN_ANALISIS: AnalisisMarketing = { angulosVenta: [], ideasContenido: [] };

export interface MarketingAnalysisProps {
  /** Descripción del producto que escribió el usuario. */
  producto: string;
  /** Código SIM de la posición elegida (`selected?.sim`). */
  ncm?: string | null;
  /** Resumen de costos de la ruta elegida; viaja como `costos`. */
  resumenCostos?: ResumenCostos | null;
}

// Análisis de marketing/comercialización con IA, posterior al cálculo.
export function MarketingAnalysis({ producto, ncm, resumenCostos }: MarketingAnalysisProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalisisMarketing | null>(null);
  /** El análisis a medio escribir; `null` fuera del streaming. */
  const [parcial, setParcial] = useState<AnalisisMarketing | null>(null);
  const [contexto, setContexto] = useState("");
  const id = useId();
  const pedido = useRef<AbortController | null>(null);

  // Si el componente se desmonta a mitad, cortar el streaming (y con él la
  // request a Anthropic del lado del servidor).
  useEffect(() => () => pedido.current?.abort(), []);

  async function run() {
    pedido.current?.abort();
    const actual = new AbortController();
    pedido.current = actual;

    setError("");
    setLoading(true);
    setParcial(SIN_ANALISIS);
    try {
      const res = await analyzeProduct(
        { producto, ncm, costos: resumenCostos, mercado: contexto.trim() || undefined },
        { onParcial: setParcial, signal: actual.signal },
      );
      setData(res);
    } catch (err) {
      if (actual.signal.aborted) return;
      setError(err instanceof Error ? err.message : "No se pudo generar el análisis.");
    } finally {
      if (pedido.current === actual) {
        setParcial(null);
        setLoading(false);
      }
    }
  }

  const escribiendo = parcial !== null;
  const vista = parcial ?? data;

  return (
    <section className={styles.card} aria-labelledby={`${id}-titulo`}>
      <div className={styles.cabecera}>
        <h2 className={styles.titulo} id={`${id}-titulo`}>
          <span className={styles.paso} aria-hidden="true">
            4
          </span>
          Análisis de comercialización (IA)
        </h2>
        <p className={styles.subtitulo}>
          Estrategia de marketing y precio sugerido para el mercado argentino, en base al costo
          real.
        </p>
      </div>

      <div className={styles.campo}>
        <label className={styles.label} htmlFor={`${id}-contexto`}>
          Contexto adicional (opcional)
        </label>
        <textarea
          id={`${id}-contexto`}
          className={styles.textarea}
          rows={2}
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          placeholder="Ej: apuntamos a e-commerce, competencia con producto local, temporada alta…"
        />
      </div>

      <Button fullWidth onClick={run} loading={loading} disabled={!producto}>
        Generar análisis de marketing
      </Button>

      {error && (
        <div className={styles.error}>
          <FormError>{error}</FormError>
          <Button variant="ghost" size="sm" onClick={run} loading={loading}>
            Reintentar
          </Button>
        </div>
      )}

      {vista && (
        // aria-busy mientras se escribe: el lector de pantalla anuncia el
        // análisis una vez, terminado, y no cada fragmento.
        <div className={styles.grilla} aria-live="polite" aria-busy={escribiendo}>
          <Block title="Público objetivo" full esperando={escribiendo && !vista.publicoObjetivo}>
            <p className={styles.texto}>{vista.publicoObjetivo}</p>
          </Block>
          <Block title="Ángulos de venta" esperando={escribiendo && !vista.angulosVenta.length}>
            <ul className={styles.lista}>
              {vista.angulosVenta.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Block>
          <Block title="Ideas de contenido" esperando={escribiendo && !vista.ideasContenido.length}>
            <ul className={styles.lista}>
              {vista.ideasContenido.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Block>
          <Block title="Campaña sugerida" full esperando={escribiendo && !vista.campanaSugerida}>
            <p className={styles.texto}>{vista.campanaSugerida}</p>
          </Block>
          <Block title="Precio sugerido" esperando={escribiendo && !vista.precioSugerido}>
            <p className={styles.texto}>{vista.precioSugerido}</p>
          </Block>
          <Block title="Riesgo principal" esperando={escribiendo && !vista.riesgoPrincipal}>
            <p className={styles.texto}>{vista.riesgoPrincipal}</p>
          </Block>
        </div>
      )}
    </section>
  );
}

function Block({
  title,
  children,
  full,
  esperando,
}: {
  title: string;
  children: ReactNode;
  full?: boolean;
  /** El modelo todavía no llegó a este bloque: esqueleto en vez de contenido. */
  esperando?: boolean;
}) {
  return (
    <div className={full ? `${styles.bloque} ${styles.bloqueCompleto}` : styles.bloque}>
      <h3 className={styles.bloqueTitulo}>{title}</h3>
      {esperando ? (
        <div className={styles.esqueleto} aria-hidden="true">
          <span className={styles.esqueletoLinea} />
          <span className={styles.esqueletoLinea} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
