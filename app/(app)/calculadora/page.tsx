import type { Metadata } from "next";
import { CotizadorSelector } from "@/components/cotizador/CotizadorSelector";
import styles from "./calculadora.module.css";

// =============================================================================
// VGRP-57 — Calculadora de importación (courier), adentro de la app. Antes era
// un link externo a vegroup.vercel.app/calculadora con su propia clave.
//
// VGRP-58 agrega el cotizador marítimo como una segunda modalidad, elegida
// con un selector dentro de la misma página — sin ruta ni menú propios
// (decisión del equipo, 2026-09-28). Este archivo no cambia de fondo: sigue
// siendo un Server Component ESTÁTICO, sólo pasa a montar
// `CotizadorSelector` en vez de `CotizadorCourier` directo.
//
// Server Component ESTÁTICO a propósito: no lee cookies ni claims. El gating
// (sesión + plan pago) lo hace `middleware.ts` (RUTAS_CON_PLAN → /comprar) y
// los endpoints lo repiten con `requierePlan()`. Todo el cotizador es cliente
// (`CotizadorSelector` → `CotizadorCourier`/`CotizadorMaritimo`); los paneles
// de resultados se cargan en diferido.
// =============================================================================

export const metadata: Metadata = { title: "Calculadora de costos — OG Circle" };

export default function CalculadoraPage() {
  return (
    <div className={styles.page}>
      <header className={styles.encabezado}>
        <p className={styles.eyebrow}>Herramienta</p>
        <h1 className={styles.titulo}>Calculadora de costos</h1>
        <p className={styles.lede}>
          Cuánto te sale realmente importar: posición arancelaria, impuestos y flete de cada
          depósito, con el dólar del día.
        </p>
      </header>

      <CotizadorSelector />
    </div>
  );
}
