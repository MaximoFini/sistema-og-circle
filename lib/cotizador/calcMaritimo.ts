// VGRP-58 — port literal de `src/lib/calcMaritimo.js` (vegroup@b550803).
// Ver lib/cotizador/ORIGEN.md.
//
// ─────────────────────────────────────────────────────────────────────────
// MOTOR DE CÁLCULO — IMPORTACIÓN MARÍTIMA
//
// Criterio de Matías, el despachante (30 ago 2026). Las tarifas viven en
// tarifasMaritimo.ts; acá está solamente cómo se arma la cuenta.
//
//   Flete pagado    = TN/m³ × 250 + 300 de BL
//   Flete declarado = 70% del pagado
//   Seguro          = 1% × (FOB + flete pagado)
//   CIF             = FOB + flete DECLARADO + seguro
//
// Dos cosas que conviene no perder de vista:
//
//   · El flete y el seguro entran DOS veces y está bien: una al valor en
//     aduana (arman el CIF y por lo tanto los derechos y el IVA) y otra a
//     gastos operativos, porque el cliente los paga. Y el flete no entra con
//     el mismo número en los dos lados: al despacho va el 70%.
//
//   · El IVA y las percepciones son recuperables. El "total a pagar" los
//     incluye; el "total costos" no, y ése es el número con el que se pone
//     precio.
//
// Todos los importes en USD salvo donde diga `ars`.
// ─────────────────────────────────────────────────────────────────────────

import {
  ARANCEL_SIM,
  CONTENEDORES,
  type Contenedor,
  FIJOS,
  FLETE,
  IVA_FIJOS,
  IVA_SERVICIOS,
  num,
  PERCEPCIONES,
  SEGURO_PCT,
  SUMA_FIJOS,
} from "./tarifasMaritimo";

/** Entradas del motor. Números o strings (como los manda el formulario). */
export interface EntradaMaritimo {
  volumenM3: number | string;
  pesoKg: number | string;
  fob: number | string;
  unidades: number | string;
  die: number | string;
  te: number | string;
  iva: number | string | null;
  tc: number | string;
  /** Override del flete (cotización cerrada del despachante). */
  fleteUsd?: number | string;
}

/** Entradas de `calcAmbas`: agrega el override de flete para el full. */
export interface EntradaAmbas extends EntradaMaritimo {
  fleteFullUsd?: number | string;
}

export interface Medidas {
  m3: number;
  kg: number;
  ton: number;
  wm: number;
  porVolumen: boolean;
}

/**
 * TN/m³ facturables: el mayor entre metros cúbicos y toneladas.
 * La regla de estiba marítima es 1 tonelada = 1 m³.
 */
export function medidas({
  volumenM3,
  pesoKg,
}: Pick<EntradaMaritimo, "volumenM3" | "pesoKg">): Medidas {
  const m3 = num(volumenM3);
  const kg = num(pesoKg);
  const ton = kg / FLETE.kgPorTonelada;
  return {
    m3,
    kg,
    ton,
    wm: Math.max(m3, ton),
    porVolumen: m3 >= ton, // qué manda: el volumen o el peso
  };
}

export interface LineaOperativa {
  key: string;
  label: string;
  usd: number;
  iva: boolean;
}

export interface Gravamenes {
  derechos: number;
  estadistica: number;
  iva: number;
  ivaAdicional: number;
  ganancias: number;
  iibb: number;
  arancelSim: number;
}

export interface Despacho extends Gravamenes {
  fob: number;
  flete: number;
  fletePagado: number;
  seguro: number;
  cif: number;
  baseIva: number;
  totalGravamenes: number;
  pct: {
    derechos: number;
    estadistica: number;
    iva: number;
    ivaAdicional: number;
    ganancias: number;
    iibb: number;
  };
}

export interface Operativos {
  lineas: LineaOperativa[];
  sumaFijos: number;
  ivaGastos: number;
  ivaPct: number;
  total: number;
}

export interface Totales {
  aPagar: number;
  aPagarArs: number;
  recuperable: number;
  recuperableArs: number;
  costos: number;
  costosArs: number;
  aumentoCostos: number;
  aumentoAPagar: number;
  costoPorUnidad: number;
  costoPorM3: number;
  costoPorKg: number;
}

export interface ResultadoMaritimo {
  medidas: Medidas;
  tc: number;
  unidades: number;
  flete: number;
  fletePagado: number;
  fleteDeclarado: number;
  fleteTarifa: number;
  fleteDeclaradoPct: number;
  fleteEsOverride: boolean;
  seguro: number;
  despacho: Despacho;
  operativos: Operativos;
  totales: Totales;
}

/** Cotiza un embarque. */
export function calcMaritimo(inp: EntradaMaritimo): ResultadoMaritimo {
  const m = medidas(inp);
  const fob = num(inp.fob);
  const tc = num(inp.tc);
  const unidades = Math.max(1, num(inp.unidades) || 1);

  // ── 1. Flete y seguro ────────────────────────────────────────────────
  // El BL de US$ 300 es fijo y ya incluye documento, gastos portuarios y
  // terminal portuaria: no va una línea aparte por eso.
  const fleteTarifa = m.wm * FLETE.porM3 + FLETE.bl;
  const fletePagado = has(inp.fleteUsd) ? num(inp.fleteUsd) : fleteTarifa;

  // A la aduana se le declara el 70% de lo que se paga.
  const fleteDeclarado = (fletePagado * FLETE.declaradoPct) / 100;

  // El seguro es una prima real sobre el valor real de la carga, así que se
  // calcula sobre el flete PAGADO. Es un solo número: el mismo que se declara
  // en el despacho y el que se le cobra al cliente.
  const seguro = ((fob + fletePagado) * SEGURO_PCT) / 100;

  // ── 2. Base imponible ────────────────────────────────────────────────
  // Con el flete declarado, no con el pagado.
  const cif = fob + fleteDeclarado + seguro;

  const diePct = num(inp.die) / 100;
  const tePct = num(inp.te) / 100;
  const ivaPct = num(inp.iva ?? 21) / 100;

  const derechos = cif * diePct;
  const estadistica = cif * tePct;
  const baseIva = cif + derechos + estadistica;

  // Las percepciones las paga siempre el importador.
  const iva = baseIva * ivaPct;
  const ivaAdicional = (baseIva * PERCEPCIONES.ivaAdicional) / 100;
  const ganancias = (baseIva * PERCEPCIONES.ganancias) / 100;
  const iibb = (baseIva * PERCEPCIONES.iibb) / 100;

  const gravamenes: Gravamenes = {
    derechos,
    estadistica,
    iva,
    ivaAdicional,
    ganancias,
    iibb,
    arancelSim: ARANCEL_SIM,
  };
  const totalGravamenes = sum(gravamenes);

  // ── 3. Gastos operativos ─────────────────────────────────────────────
  // El flete y el seguro se le cobran al cliente además de haber entrado al
  // CIF. Los siete fijos son iguales en toda importación y su IVA se factura
  // como un único ítem al final: al cliente se le hace factura A.
  const lineas: LineaOperativa[] = [
    { key: "flete", label: "Flete internacional", usd: fletePagado, iva: false },
    { key: "seguro", label: "Seguro internacional", usd: seguro, iva: false },
    ...FIJOS.map((f) => ({ key: f.key, label: f.label, usd: f.monto, iva: true })),
  ];
  const ivaGastos = IVA_FIJOS;
  const totalGastos = lineas.reduce((a, l) => a + l.usd, 0) + ivaGastos;

  // ── 4. Totales ───────────────────────────────────────────────────────
  const aPagar = fob + totalGravamenes + totalGastos;
  const recuperable = iva + ivaAdicional + ganancias + iibb + ivaGastos;
  const costos = aPagar - recuperable;

  return {
    medidas: m,
    tc,
    unidades,
    flete: fletePagado, // el que se paga — es el que manda para comparar opciones
    fletePagado,
    fleteDeclarado,
    fleteTarifa,
    fleteDeclaradoPct: FLETE.declaradoPct / 100,
    fleteEsOverride: has(inp.fleteUsd),
    seguro,
    despacho: {
      fob,
      flete: fleteDeclarado, // a la aduana se le declara el 70%
      fletePagado,
      seguro,
      cif,
      ...gravamenes,
      baseIva,
      totalGravamenes,
      pct: {
        derechos: diePct,
        estadistica: tePct,
        iva: ivaPct,
        ivaAdicional: PERCEPCIONES.ivaAdicional / 100,
        ganancias: PERCEPCIONES.ganancias / 100,
        iibb: PERCEPCIONES.iibb / 100,
      },
    },
    operativos: {
      lineas,
      sumaFijos: SUMA_FIJOS,
      ivaGastos,
      ivaPct: IVA_SERVICIOS,
      total: totalGastos,
    },
    totales: {
      aPagar,
      aPagarArs: aPagar * tc,
      recuperable,
      recuperableArs: recuperable * tc,
      costos,
      costosArs: costos * tc,
      // Cuánto encarece la nacionalización sobre el FOB. El de "costos" es el
      // que sirve para poner precio; el de "a pagar" es la plata que hay que
      // tener el día del despacho.
      aumentoCostos: fob > 0 ? costos / fob - 1 : 0,
      aumentoAPagar: fob > 0 ? aPagar / fob - 1 : 0,
      costoPorUnidad: costos / unidades,
      costoPorM3: m.m3 > 0 ? costos / m.m3 : 0,
      costoPorKg: m.kg > 0 ? costos / m.kg : 0,
    },
  };
}

export interface ContenedorSugerido extends Contenedor {
  ocupacion: number;
  cantidad: number;
  limita: "peso" | "volumen";
}

export interface ResultadoAmbas {
  consolidado: ResultadoMaritimo;
  full: ResultadoMaritimo;
  contenedor: ContenedorSugerido;
  fullEsEstimado: boolean;
}

/**
 * Las dos cotizaciones que ve el usuario: consolidado y full.
 *
 * Hoy salen con la misma tarifa por m³ — el flete de contenedor completo lo
 * cotiza el despachante caso por caso y no hay precio publicado. La de full
 * agrega en qué contenedor entra la carga y el aviso de consultarlo.
 */
export function calcAmbas(inp: EntradaAmbas): ResultadoAmbas {
  const consolidado = calcMaritimo(inp);
  const full = calcMaritimo({ ...inp, fleteUsd: inp.fleteFullUsd });

  return {
    consolidado,
    full,
    contenedor: contenedorSugerido(consolidado.medidas),
    // Sólo se puede comparar de verdad cuando hay una tarifa firme de contenedor.
    fullEsEstimado: !has(inp.fleteFullUsd),
  };
}

/**
 * En qué contenedor entra la carga. Devuelve el más chico que la aguante por
 * volumen y por peso; si no entra en ninguno, cuántos hacen falta.
 */
export function contenedorSugerido({ m3, kg }: Pick<Medidas, "m3" | "kg">): ContenedorSugerido {
  for (const c of CONTENEDORES) {
    if (m3 <= c.cbm && kg <= c.pesoMax) {
      return {
        ...c,
        ocupacion: c.cbm > 0 ? m3 / c.cbm : 0,
        cantidad: 1,
        limita: kg / c.pesoMax > m3 / c.cbm ? "peso" : "volumen",
      };
    }
  }
  const mayor = CONTENEDORES[CONTENEDORES.length - 1] as Contenedor;
  const porVolumen = Math.ceil(m3 / mayor.cbm);
  const porPeso = Math.ceil(kg / mayor.pesoMax);
  const cantidad = Math.max(1, porVolumen, porPeso);
  return {
    ...mayor,
    ocupacion: m3 / (mayor.cbm * cantidad),
    cantidad,
    limita: porPeso > porVolumen ? "peso" : "volumen",
  };
}

function has(v: unknown): boolean {
  if (v == null || v === "") return false;
  return Number.isFinite(
    typeof v === "string" ? Number.parseFloat(v.replace(",", ".")) : (v as number),
  );
}
function sum(obj: object): number {
  return (Object.values(obj) as number[]).reduce((a, b) => a + b, 0);
}
