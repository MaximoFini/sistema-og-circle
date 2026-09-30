"use client";

// VGRP-57 — ex vegroup@b550803 src/components/MarketingAnalysis.jsx, en
// Liquid Glass. Mismas secciones, textos y comportamiento, SIN `LeadGate`: el
// usuario ya está logueado y con plan, no se le pide nombre ni WhatsApp
// (requirements US-6). Lo carga CotizadorCourier con next/dynamic.
//
// Si la IA falla: el error se muestra con FormError y un "Reintentar" que
// vuelve a pedir el análisis con el mismo contexto. La cotización no se toca
// (vive en CotizadorCourier) y, como en el original, un análisis anterior
// queda a la vista.

import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { type AnalisisMarketing, analyzeProduct, type ResumenCostos } from "@/lib/cotizador/api";
import styles from "./MarketingAnalysis.module.css";

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
  const [contexto, setContexto] = useState("");
  const id = useId();

  async function run() {
    setError("");
    setLoading(true);
    try {
      const res = await analyzeProduct({
        producto,
        ncm,
        costos: resumenCostos,
        mercado: contexto.trim() || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }

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

      {data && (
        <div className={styles.grilla} aria-live="polite">
          <Block title="Público objetivo" full>
            <p className={styles.texto}>{data.publicoObjetivo}</p>
          </Block>
          <Block title="Ángulos de venta">
            <ul className={styles.lista}>
              {(data.angulosVenta || []).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Block>
          <Block title="Ideas de contenido">
            <ul className={styles.lista}>
              {(data.ideasContenido || []).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </Block>
          <Block title="Campaña sugerida" full>
            <p className={styles.texto}>{data.campanaSugerida}</p>
          </Block>
          <Block title="Precio sugerido">
            <p className={styles.texto}>{data.precioSugerido}</p>
          </Block>
          <Block title="Riesgo principal">
            <p className={styles.texto}>{data.riesgoPrincipal}</p>
          </Block>
        </div>
      )}
    </section>
  );
}

function Block({ title, children, full }: { title: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? `${styles.bloque} ${styles.bloqueCompleto}` : styles.bloque}>
      <h3 className={styles.bloqueTitulo}>{title}</h3>
      {children}
    </div>
  );
}
