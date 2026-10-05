import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CotizadorSelector } from "@/components/cotizador/CotizadorSelector";
import { TarjetaDesbloqueo } from "@/components/ui/TarjetaDesbloqueo";
import { isNivelAcceso, NIVELES } from "@/lib/auth/claims";
import { getOfertaPlan } from "@/lib/config";
import styles from "./calculadora.module.css";

// =============================================================================
// VGRP-57 — Calculadora de importación (courier), adentro de la app. Antes era
// un link externo a vegroup.vercel.app/calculadora con su propia clave.
//
// VGRP-58 agrega el cotizador marítimo como una segunda modalidad, elegida
// con un selector dentro de la misma página — sin ruta ni menú propios
// (decisión del equipo, 2026-09-28).
//
// VGRP-77: pasa a tener una variante estática por nivel, igual que
// `/dashboard/[variante]`. `middleware.ts` reescribe `/calculadora` a
// `/calculadora/ninguno` o `/calculadora/completo` según el claim de nivel
// (antes, sin plan redirigía a `/comprar`). 'ninguno' es la calculadora real,
// borrosa e inerte, con la tarjeta de desbloqueo encima: acá no viaja ningún
// dato sensible (todo el cotizador es código de cliente) y los endpoints
// `/api/cotizador/*` siguen exigiendo plan con `requierePlan()` (403).
//
// Server Component ESTÁTICO a propósito: no lee cookies ni claims. Todo el
// cotizador es cliente (`CotizadorSelector` → `CotizadorCourier`/
// `CotizadorMaritimo`); los paneles de resultados se cargan en diferido.
// =============================================================================

export const metadata: Metadata = { title: "Calculadora de costos — OG Circle" };

export function generateStaticParams() {
  return NIVELES.map((variante) => ({ variante }));
}

export const dynamicParams = false;

// Piso de frescura del precio de la tarjeta (`getOfertaPlan()`, que además se
// invalida por tag al guardarlo desde admin). Mismo criterio que el Inicio.
export const revalidate = 3600;

function Calculadora({ bloqueado = false }: { bloqueado?: boolean }) {
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

      <CotizadorSelector bloqueado={bloqueado} />
    </div>
  );
}

export default async function CalculadoraPage({
  params,
}: {
  params: Promise<{ variante: string }>;
}) {
  const { variante } = await params;
  if (!isNivelAcceso(variante)) {
    notFound();
  }

  if (variante === "completo") {
    return <Calculadora />;
  }

  const { nombre, precio } = await getOfertaPlan();
  return (
    <TarjetaDesbloqueo nombrePlan={nombre} precio={precio}>
      <Calculadora bloqueado />
    </TarjetaDesbloqueo>
  );
}
