// Tipos del motor de cálculo (calc.ts) y de la base NCM (ncm/*). Se
// escribieron a partir del shape REAL que arma/devuelve el código original
// (vegroup@b550803 src/lib/calc.js, src/data/ncm.js, src/data/ncm.json) y de
// cómo lo usa src/components/AgentQuote.jsx — no al revés. Si un tipo de acá
// no encaja con lo que hace el motor, se corrige el tipo, nunca la fórmula.
//
// Sin imports: este archivo lo consumen Client Components y el test.

// ── Régimen ──────────────────────────────────────────────────────────────

/** Los tres regímenes del selector de AgentQuote (mismos literales). */
export type Regimen = "general" | "pequeños" | "integral";

// ── Rutas y configuración (constantes de calc.ts) ───────────────────────

export type RutaId = "miami" | "barcelona" | "china";

/** Una entrada de ROUTES (un depósito de origen). */
export interface Ruta {
  id: RutaId;
  label: string;
  pais: string;
  direccion: string;
  freightPerKg: number;
  volRatePerKg: number;
  handlingOrigenDefault: number;
  tiempoEstimado: string;
  /** Tarifas del courier integral: ≥ INTEGRAL_THRESHOLD kg → mayor, si no menor. */
  integral: { mayor: number; menor: number; vol: boolean };
}

/** Shape de CONFIG; calcRoute() acepta otro con este mismo shape. */
export interface ConfigCalculo {
  pesoFactor: number;
  seguroFactor: number;
  divisorVolumetrico: number;
  ivaServicios: number;
  tcaPorKgDia: number;
  diasTcaDefault: number;
  cargoFijo: number;
  comisionSeguroFobRate: number;
  handlingDestinoPorKg: number;
  comisionVegroupPorKg: number;
}

// ── Entrada del motor ────────────────────────────────────────────────────

/**
 * Lo que acepta el `num()` interno del motor: AgentQuote le pasa los strings
 * crudos del formulario ("12,5", "") mezclados con números de la base NCM.
 * Cualquier cosa que no parsee a un número finito cuenta como 0.
 */
export type ValorNumerico = number | string | null | undefined;

/**
 * Entrada de calcRoute / calcAllRoutes / calcIntegral / calcAllIntegral.
 * Todo es opcional porque el original lo es: `num(undefined)` da 0 y el
 * courier integral directamente no manda fob/die/te/iva (ver
 * AgentQuote.handleQuote, de donde salen estos campos).
 */
export interface EntradaCalculo {
  /** Valor FOB total (USD). */
  fob?: ValorNumerico;
  /** Peso real bruto total (kg). */
  pesoKg?: ValorNumerico;
  /** Cantidad de cajas/bultos. */
  cajas?: ValorNumerico;
  /** Medidas de UNA caja (cm). */
  largo?: ValorNumerico;
  ancho?: ValorNumerico;
  alto?: ValorNumerico;
  /** Cantidad total de unidades (mínimo efectivo 1). */
  unidades?: ValorNumerico;
  /** Derechos de importación (%), de la posición SIM. */
  die?: ValorNumerico;
  /** Tasa de estadística (%), de la posición SIM. */
  te?: ValorNumerico;
  /** IVA (%) de la posición SIM. Si falta o es "" el motor usa 21. */
  iva?: ValorNumerico;
  /** Impuestos internos nominales (%). En la base NCM viene como string. */
  impInternosNom?: ValorNumerico;
  /** Dólar Banco Nación (destino + IVA en pesos). */
  dolarBN?: ValorNumerico;
  /** Dólar CCL/cripto (FOB en pesos). Si falta, se usa el BNA. */
  dolarCCL?: ValorNumerico;
  /** Días de terminal (default CONFIG.diasTcaDefault). AgentQuote no lo manda. */
  diasTca?: ValorNumerico;
  /** Gastos de origen (USD); si falta o es "", el default de la ruta. AgentQuote no lo manda. */
  handlingOrigen?: ValorNumerico;
}

// ── Salida del motor: régimen general / pequeños envíos ─────────────────

/** Líneas de gasto en destino, en el mismo orden que las suma calcRoute (B17–B26). */
export interface GastosDestino {
  flete: number;
  tca: number;
  cargoFijo: number;
  comisionSeguro: number;
  handlingDestino: number;
  handlingOrigen: number;
  volumetrico: number;
  derechos: number;
  estadistica: number;
  impInternos: number;
  comisionVegroup: number;
}

/** Lo que devuelve calcRoute() para una ruta. */
export interface ResultadoRuta {
  route: RutaId;
  label: string;
  pais: string;
  freightPerKg: number;
  tiempoEstimado: string;
  cif: number;
  pesoVolumetrico: number;
  volumen: number;
  fob: number;
  gastosDestino: GastosDestino;
  totalGastosDestino: number;
  noRecuperable: { fob: number } & GastosDestino;
  recuperable: { iva: number };
  totalNoRecuperable: number;
  totalRecuperable: number;
  totalUSD: number;
  /** null si falta alguno de los dos tipos de cambio. */
  totalPesos: number | null;
  proveedorPesos: number | null;
  destinoPesos: number | null;
  ivaPesos: number | null;
  dolarCCL: number | null;
  dolarBN: number | null;
  costoPorKg: number;
  costoRealEfectivo: number;
  costoPorUnidad: number;
  unidades: number;
  /** Alias de totalUSD que el original mantiene "por compat con la UI". */
  costoTotal: number;
}

/** Lo que devuelve calcAllRoutes(). */
export interface ResultadoRutas {
  results: ResultadoRuta[];
  mejorRuta: RutaId;
}

// ── Salida del motor: courier integral ───────────────────────────────────

/** Lo que devuelve calcIntegral() para una ruta. */
export interface ResultadoIntegral {
  route: RutaId;
  label: string;
  pais: string;
  tiempoEstimado: string;
  pesoReal: number;
  pesoVolumetrico: number;
  excesoVol: number;
  rate: number;
  base: number;
  volCost: number;
  totalUSD: number;
  totalPesos: number | null;
  costoPorKg: number;
  costoPorUnidad: number;
  unidades: number;
}

/** Lo que devuelve calcAllIntegral(). */
export interface ResultadoIntegrales {
  results: ResultadoIntegral[];
  mejorRuta: RutaId;
}

/** Claves de LABELS: las del desglose + cif, fob e iva. */
export type ClaveEtiqueta = keyof GastosDestino | "cif" | "fob" | "iva";

// ── Base NCM ─────────────────────────────────────────────────────────────

/**
 * Tupla de un sufijo SIM tal como viene en ncm-2026-1.json:
 * [sufijo, descripción, die, te, iva, ivaAd, lic, antidumping, impInternos].
 * Tipos verificados contra el JSON: antidumping es "" o "Sí" e impInternos es
 * un string ("", "9.5", "20"…), NO un número.
 */
export type TuplaSufijoCruda = [
  sufijo: string,
  descripcion: string,
  die: number,
  te: number,
  iva: number,
  ivaAd: number,
  lic: string,
  antidumping: string,
  impInternos: string,
];

/** Una posición NCM de 8 dígitos tal como viene en el JSON. */
export interface PosicionNcmCruda {
  ncm: string;
  descripcion: string;
  suf: TuplaSufijoCruda[];
}

/** El JSON completo de la base. */
export type BaseNcmCruda = PosicionNcmCruda[];

/**
 * Registro SIM plano, como lo arma tupleToRecord() en data/ncm.js.
 * Diferencia con el borrador del design: `impInternos` es string porque así
 * viene en la base (el motor lo pasa por num() igual).
 */
export interface RegistroSim {
  sim: string;
  ncm: string;
  sufijo: string;
  descripcion: string;
  descripcionSufijo: string;
  die: number;
  te: number;
  iva: number;
  ivaAd: number;
  lic: string;
  antidumping: string;
  impInternos: string;
}

/** Posición NCM ya cargada: el heading con sus sufijos convertidos a registro. */
export interface PosicionNcm {
  ncm: string;
  descripcion: string;
  suf: RegistroSim[];
}

/** Resultado de searchNCM / searchByPartidas: el registro + su puntaje. */
export type CandidatoSim = RegistroSim & { score: number };

/**
 * Shape de la constante PEQUEÑOS_ENVIOS. NO es un RegistroSim: no tiene
 * `descripcionSufijo`, `antidumping` es `false` e `impInternos` es `0`
 * (número). Así está en el original; AgentQuote la usa como posición elegida.
 */
export interface RegistroPequenosEnvios {
  sim: string;
  ncm: string;
  sufijo: string;
  descripcion: string;
  die: number;
  te: number;
  iva: number;
  ivaAd: number;
  lic: string;
  antidumping: false;
  impInternos: number;
}

/** Lo que puede quedar como posición elegida en la UI (el `selected` de AgentQuote). */
export type PosicionElegida = RegistroSim | RegistroPequenosEnvios;

// ── VGRP-58 — motor marítimo ────────────────────────────────────────────
// Los tipos viven junto al motor (lib/cotizador/calcMaritimo.ts, mismo
// criterio que calc.ts) y se re-exportan acá para que el resto del cotizador
// los importe todos desde `types.ts`, como el resto de los tipos del módulo.
export type {
  ContenedorSugerido,
  Despacho,
  EntradaAmbas,
  EntradaMaritimo,
  Gravamenes,
  LineaOperativa,
  Medidas as MedidasMaritimo,
  Operativos,
  ResultadoAmbas,
  ResultadoMaritimo,
  Totales as TotalesMaritimo,
} from "./calcMaritimo";

/**
 * Posición fiscal efectiva del cotizador marítimo: lo cargado a mano en
 * `CotizadorMaritimo` pisa lo que detectó la IA — igual que el original
 * (`fiscal` de `MaritimoQuote.jsx`). No es un `PosicionElegida`: sólo lleva
 * los campos que el motor necesita.
 */
export interface FiscalMaritimo {
  sim: string;
  descripcion: string;
  die: number;
  te: number;
  iva: number;
}
