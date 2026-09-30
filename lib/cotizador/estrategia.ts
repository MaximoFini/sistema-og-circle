// Motor de la estrategia de venta — port LITERAL de la lógica de
// vegroup@b550803 src/components/PriceStrategy.jsx (tablas de referencia
// 2026, `fijoML`, `num`, `ponderar`, `armar`, `resolverPrecio`,
// `desglosar`, `money`, `pct`) y de los `useMemo` del componente (entrada,
// ranking, canal elegido, lote y avisos).
//
// Es capa de "números" (ver lib/cotizador/ORIGEN.md): ni una constante,
// fórmula, redondeo u orden de operaciones distinto al original. Los
// nombres son los del original a propósito, para diffear archivo contra
// archivo. Lo protege lib/cotizador/estrategia.test.ts contra
// test/fixtures/cotizador/estrategia.json, que genera el código ORIGINAL
// (scripts/cotizador/generar-fixtures-estrategia.mjs).
//
// Únicos cambios respecto del original, todos de forma y no de cuenta:
// - Tipos (TS strict). Donde un `filter` tenía que angostar el tipo, el
//   callback pasó a ser un type guard con la MISMA condición.
// - Los `useMemo` del componente son funciones puras; `evaluarEstrategia`
//   las encadena en el mismo orden que el render del original.
// - Las acciones de los avisos (`accion.fn`, que en el original llamaba a
//   `setMargen`/`setFiscal`) se describen como `efecto`; el componente las
//   aplica. El fixture registra qué setter llamaba cada `fn` del original.
//
// Sin imports: lo consumen el componente (cliente) y el test.

/* ================================================================== */
/*  TABLAS DE REFERENCIA 2026                                         */
/* ================================================================== */

export const IVA = 0.21;

export interface CategoriaML {
  /** Comisión de la publicación clásica (%). */
  c: number;
  /** Comisión de la publicación premium (%). */
  p: number;
  /** Sin costo fijo por unidad (Supermercado). */
  sinFijo?: boolean;
  /** Puntos extra sobre la comisión. */
  extra?: number;
}

export const CATEGORIAS_ML: Record<string, CategoriaML> = {
  "Accesorios para vehículos": { c: 13.5, p: 16.5 },
  Agro: { c: 12.5, p: 15.5 },
  "Alimentos y bebidas": { c: 11.8, p: 14.8 },
  "Animales y mascotas": { c: 13.5, p: 16.5 },
  "Antigüedades y colecciones": { c: 14.0, p: 17.0 },
  "Arte, librería y mercería": { c: 14.0, p: 17.0 },
  Bebés: { c: 13.5, p: 16.5 },
  "Belleza y cuidado personal": { c: 14.5, p: 17.14 },
  "Cámaras y accesorios": { c: 15.0, p: 17.14 },
  "Celulares y teléfonos": { c: 15.0, p: 17.14 },
  Computación: { c: 15.0, p: 17.14 },
  "Consolas y videojuegos": { c: 15.0, p: 17.14 },
  Construcción: { c: 12.5, p: 15.5 },
  "Deportes y fitness": { c: 13.5, p: 16.5 },
  "Electrodomésticos y aires ac.": { c: 12.5, p: 15.5 },
  "Electrónica, audio y video": { c: 15.0, p: 17.14 },
  Herramientas: { c: 13.0, p: 16.0 },
  "Hogar, muebles y jardín": { c: 13.5, p: 16.5 },
  "Industrias y oficinas": { c: 12.5, p: 15.5 },
  "Instrumentos musicales": { c: 13.5, p: 16.5 },
  "Joyas y relojes": { c: 14.5, p: 17.14 },
  "Juegos y juguetes": { c: 14.0, p: 17.0 },
  "Libros, revistas y comics": { c: 14.0, p: 17.0 },
  "Música, películas y series": { c: 14.0, p: 17.0 },
  "Ropa y accesorios": { c: 14.5, p: 17.14 },
  "Salud y equipamiento médico": { c: 13.5, p: 16.5 },
  "Souvenirs y cotillón": { c: 14.5, p: 17.14 },
  Supermercado: { c: 11.8, p: 14.8, sinFijo: true, extra: 3 },
  "Otras categorías": { c: 13.5, p: 16.5 },
};

export type ClaveMedio = "cred1" | "cred3" | "cred6" | "debito" | "cuenta" | "transf";

export interface Medio {
  k: ClaveMedio;
  n: string;
  tarjeta: boolean;
}

export const MEDIOS: Medio[] = [
  { k: "cred1", n: "Crédito, un pago", tarjeta: true },
  { k: "cred3", n: "Crédito, 3 cuotas sin interés", tarjeta: true },
  { k: "cred6", n: "Crédito, 6 cuotas sin interés", tarjeta: true },
  { k: "debito", n: "Tarjeta de débito", tarjeta: true },
  { k: "cuenta", n: "Dinero en cuenta o QR", tarjeta: false },
  { k: "transf", n: "Transferencia o CVU", tarjeta: false },
];

export const MIX_TIPICO: Record<ClaveMedio, number> = {
  cred1: 30,
  cred3: 20,
  cred6: 20,
  debito: 15,
  cuenta: 10,
  transf: 5,
};

export type ClavePasarela = "mp_10" | "mp_inm" | "mp_30" | "uala" | "pagonube";

export interface Pasarela {
  n: string;
  detalle: string;
  /** Arancel por medio de pago (%). */
  a: Record<ClaveMedio, number>;
  /** Días hasta cobrar, por medio de pago. */
  d: Record<ClaveMedio, number>;
}

export const PASARELAS: Record<ClavePasarela, Pasarela> = {
  mp_10: {
    n: "Mercado Pago",
    detalle: "cobro a 10 días",
    a: { cred1: 3.99, cred3: 9.74, cred6: 14.74, debito: 3.25, cuenta: 3.99, transf: 0.9 },
    d: { cred1: 10, cred3: 10, cred6: 10, debito: 1, cuenta: 0, transf: 0 },
  },
  mp_inm: {
    n: "Mercado Pago",
    detalle: "cobro al instante",
    a: { cred1: 6.49, cred3: 12.24, cred6: 17.24, debito: 3.25, cuenta: 6.49, transf: 0.9 },
    d: { cred1: 0, cred3: 0, cred6: 0, debito: 0, cuenta: 0, transf: 0 },
  },
  mp_30: {
    n: "Mercado Pago",
    detalle: "cobro a 30 días",
    a: { cred1: 2.99, cred3: 8.74, cred6: 13.74, debito: 2.99, cuenta: 2.99, transf: 0.9 },
    d: { cred1: 30, cred3: 30, cred6: 30, debito: 30, cuenta: 0, transf: 0 },
  },
  uala: {
    n: "Ualá Bis",
    detalle: "cobro al instante",
    a: { cred1: 4.9, cred3: 10.65, cred6: 15.65, debito: 2.9, cuenta: 4.9, transf: 0.9 },
    d: { cred1: 0, cred3: 0, cred6: 0, debito: 0, cuenta: 0, transf: 0 },
  },
  pagonube: {
    n: "Pago Nube",
    detalle: "cobro a 1 día",
    a: { cred1: 6.4, cred3: 12.15, cred6: 17.15, debito: 6.4, cuenta: 6.4, transf: 0.85 },
    d: { cred1: 1, cred3: 1, cred6: 1, debito: 1, cuenta: 0, transf: 0 },
  },
};

export const ARANCEL_ML: Record<ClaveMedio, number> = {
  cred1: 0,
  cred3: 5.75,
  cred6: 10.75,
  debito: 0,
  cuenta: 0,
  transf: 0,
};
export const DIAS_ML: Record<ClaveMedio, number> = {
  cred1: 12,
  cred3: 12,
  cred6: 12,
  debito: 12,
  cuenta: 12,
  transf: 12,
};

export type ClaveCanal =
  | "ml_clasica"
  | "ml_premium"
  | "tiendanube"
  | "shopify"
  | "empretienda"
  | "propia";

export interface CanalML {
  nombre: string;
  variante: string;
  ml: true;
  /** Qué comisión de CATEGORIAS_ML usa: clásica (`c`) o premium (`p`). */
  campo: "c" | "p";
}

export interface CanalTienda {
  nombre: string;
  variante: string;
  ml: false;
  /** Comisión (%) de cada plan. */
  planes: Record<string, number>;
  /** Plan por defecto. */
  plan: string;
}

export type Canal = CanalML | CanalTienda;

// El orden de las claves importa: el ranking sale de Object.keys(CANALES)
// y el `sort` es estable, así que los empates quedan en este orden.
export const CANALES: Record<ClaveCanal, Canal> = {
  ml_clasica: { nombre: "Mercado Libre", variante: "Publicación clásica", ml: true, campo: "c" },
  ml_premium: { nombre: "Mercado Libre", variante: "Publicación premium", ml: true, campo: "p" },
  tiendanube: {
    nombre: "Tiendanube",
    variante: "Tienda propia",
    ml: false,
    planes: { Inicial: 2, Esencial: 1.5, Evoluciona: 1, Avanzado: 0.7, Escala: 0 },
    plan: "Inicial",
  },
  shopify: {
    nombre: "Shopify",
    variante: "Tienda propia",
    ml: false,
    planes: { Basic: 2, Grow: 1, Advanced: 0.6, Plus: 0.2 },
    plan: "Basic",
  },
  empretienda: {
    nombre: "Empretienda",
    variante: "Tienda propia",
    ml: false,
    planes: { "Plan gratuito": 2, "Plan pago": 0 },
    plan: "Plan gratuito",
  },
  propia: {
    nombre: "Web propia",
    variante: "WooCommerce o a medida",
    ml: false,
    planes: { "Sin comisión de plataforma": 0 },
    plan: "Sin comisión de plataforma",
  },
};

export function fijoML(precio: number, categoria: string): number {
  const cat = CATEGORIAS_ML[categoria];
  if (cat?.sinFijo) return 0;
  if (precio <= 0) return 0;
  if (precio < 15000) return 1115;
  if (precio < 25000) return 2300;
  if (precio < 33000) return 2810;
  return 0;
}

/* Lee números escritos a la argentina sin romper decimales con punto. */
export function num(s: string | number): number {
  if (typeof s === "number") return Number.isNaN(s) ? 0 : s;
  let t = String(s).trim().replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const v = parseFloat(t);
  return Number.isNaN(v) ? 0 : v;
}

/* ================================================================== */
/*  MOTOR                                                             */
/* ================================================================== */

/** Lo que el componente arma a partir del formulario (ex `entrada` de PriceStrategy). */
export interface EntradaEstrategia {
  costo: number;
  envio: number;
  otros: number;
  ri: boolean;
  ivaRecuperable: boolean;
  categoria: string;
  canalKey: ClaveCanal;
  planes: Record<ClaveCanal, string>;
  pasarelaKey: ClavePasarela;
  mix: Record<ClaveMedio, number>;
  comisionManual: number | null;
  iibb: number;
  sirtac: number;
  retIVA: number;
  retGan: number;
  retencionesRecuperables: boolean;
  tasaCapital: number;
  margen: number;
}

export type MedioPonderado = Medio & { w: number; a: number; d: number };

export interface Ponderacion {
  porMedio: MedioPonderado[];
  arancel: number;
  dias: number;
  pesoTarjeta: number;
}

export function ponderar(
  mix: Record<ClaveMedio, number>,
  arancel: Record<ClaveMedio, number>,
  dias: Record<ClaveMedio, number>,
): Ponderacion {
  const total = MEDIOS.reduce((s, m) => s + (mix[m.k] || 0), 0) || 1;
  let ar = 0;
  let di = 0;
  let tarjeta = 0;
  const porMedio = MEDIOS.map((m) => {
    const w = (mix[m.k] || 0) / total;
    const a = (arancel[m.k] || 0) / 100;
    const d = dias[m.k] || 0;
    ar += w * a;
    di += w * d;
    if (m.tarjeta) tarjeta += w;
    return { ...m, w, a, d };
  });
  return { porMedio, arancel: ar, dias: di, pesoTarjeta: tarjeta };
}

export interface Armado {
  canal: Canal;
  p: Ponderacion;
  comision: number;
  financiero: number;
  sobreVenta: number;
  retCosto: number;
}

export function armar(e: EntradaEstrategia, canalKey: ClaveCanal): Armado {
  const canal = CANALES[canalKey];
  const arancel = canal.ml ? ARANCEL_ML : PASARELAS[e.pasarelaKey].a;
  const dias = canal.ml ? DIAS_ML : PASARELAS[e.pasarelaKey].d;
  const p = ponderar(e.mix, arancel, dias);

  let comision: number;
  if (e.comisionManual != null && canalKey === e.canalKey) comision = e.comisionManual;
  else if (canal.ml) {
    const cat = CATEGORIAS_ML[e.categoria] || CATEGORIAS_ML["Otras categorías"];
    comision = (cat[canal.campo] || 0) + (cat.extra || 0);
  } else comision = canal.planes[e.planes[canalKey]] ?? 0;

  const financiero = (p.dias / 30) * (e.tasaCapital / 100);
  const retCosto = e.retencionesRecuperables
    ? 0
    : p.pesoTarjeta * ((e.sirtac + (e.ri ? e.retIVA + e.retGan : 0)) / 100);
  const sobreVenta = 1.21 * (comision / 100 + p.arancel) + e.iibb / 100 + financiero + retCosto;
  return { canal, p, comision, financiero, sobreVenta, retCosto };
}

export type Resolucion =
  | { imposible: true; sobreVenta: number; A: Armado }
  | { imposible?: undefined; precio: number; A: Armado; oscila?: true };

export function resolverPrecio(e: EntradaEstrategia, canalKey: ClaveCanal): Resolucion {
  const A = armar(e, canalKey);
  const den = 1 - A.sobreVenta - e.margen / 100;
  if (den <= 0.02) return { imposible: true, sobreVenta: A.sobreVenta, A };

  const calc = (fijo: number) => {
    const cost = e.ri && e.ivaRecuperable ? e.costo / 1.21 : e.costo;
    const otr = e.ri && e.ivaRecuperable ? e.otros / 1.21 : e.otros;
    const log = e.ri ? e.envio + fijo : 1.21 * (e.envio + fijo);
    const base = (cost + otr + log) / den;
    return e.ri ? base * 1.21 : base;
  };

  if (!A.canal.ml) return { precio: calc(0), A };

  let fijo = 0;
  const vistos: number[] = [];
  for (let i = 0; i < 30; i++) {
    const precio = calc(fijo);
    const sig = fijoML(precio, e.categoria);
    if (sig === fijo) return { precio, A };
    if (vistos.includes(sig)) {
      const alto = Math.max(...vistos, sig);
      return { precio: calc(alto), A, oscila: true };
    }
    vistos.push(fijo);
    fijo = sig;
  }
  return { precio: calc(fijo), A };
}

export type MedioConGanancia = MedioPonderado & { ganancia: number; margen: number };

export interface Desglose {
  precio: number;
  baseNeta: number;
  ivaDebito: number;
  comisionCanal: number;
  comision: number;
  fijo: number;
  arancelPago: number;
  ivaCargos: number;
  iibb: number;
  finan: number;
  retTotal: number;
  retComoCosto: number;
  envio: number;
  costoProd: number;
  otros: number;
  ganancia: number;
  gan35: number;
  gananciaFinal: number;
  porMedio: MedioConGanancia[];
  p: Ponderacion;
  canal: Canal;
  margen: number;
}

export function desglosar(e: EntradaEstrategia, canalKey: ClaveCanal, precio: number): Desglose {
  const A = armar(e, canalKey);
  const { p, canal, comision, financiero } = A;
  const fijo = canal.ml ? fijoML(precio, e.categoria) : 0;

  const comisionCanal = (comision / 100) * precio;
  const arancelPago = p.arancel * precio;
  const ivaCargos = IVA * (comisionCanal + arancelPago + fijo);

  const baseNeta = e.ri ? precio / 1.21 : precio;
  const ivaDebito = e.ri ? precio - baseNeta : 0;
  const iibb = (e.iibb / 100) * baseNeta;
  const finan = financiero * precio;

  const retTotal = p.pesoTarjeta * ((e.sirtac + (e.ri ? e.retIVA + e.retGan : 0)) / 100) * precio;
  const retComoCosto = e.retencionesRecuperables ? 0 : retTotal;

  const costoProd = e.ri && e.ivaRecuperable ? e.costo / 1.21 : e.costo;
  const otros = e.ri && e.ivaRecuperable ? e.otros / 1.21 : e.otros;
  const envio = e.ri ? e.envio : e.envio * 1.21;

  const cargos = e.ri
    ? comisionCanal + arancelPago + fijo
    : comisionCanal + arancelPago + fijo + ivaCargos;
  const ganancia = baseNeta - cargos - iibb - finan - retComoCosto - envio - costoProd - otros;
  const gan35 = e.ri ? Math.max(0, ganancia) * 0.35 : 0;

  const porMedio = p.porMedio.map((m) => {
    const ar = m.a * precio;
    const iv = IVA * (comisionCanal + ar + fijo);
    const fi = (m.d / 30) * (e.tasaCapital / 100) * precio;
    const rt = e.retencionesRecuperables
      ? 0
      : m.tarjeta
        ? ((e.sirtac + (e.ri ? e.retIVA + e.retGan : 0)) / 100) * precio
        : 0;
    const cg = e.ri ? comisionCanal + ar + fijo : comisionCanal + ar + fijo + iv;
    const g = baseNeta - cg - iibb - fi - rt - envio - costoProd - otros;
    const gf = e.ri ? g - Math.max(0, g) * 0.35 : g;
    return { ...m, ganancia: gf, margen: baseNeta > 0 ? gf / baseNeta : 0 };
  });

  return {
    precio,
    baseNeta,
    ivaDebito,
    comisionCanal,
    comision,
    fijo,
    arancelPago,
    ivaCargos,
    iibb,
    finan,
    retTotal,
    retComoCosto,
    envio,
    costoProd,
    otros,
    ganancia,
    gan35,
    gananciaFinal: ganancia - gan35,
    porMedio,
    p,
    canal,
    margen: baseNeta > 0 ? (ganancia - gan35) / baseNeta : 0,
  };
}

/* ================================================================== */
/*  FORMATO                                                           */
/* ================================================================== */

export const money = (v: number | null | undefined): string => {
  const n = Math.round(v || 0);
  const s = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  return (n < 0 ? "−" : "") + s;
};
export const pct = (v: number | null | undefined, d = 1): string =>
  `${((v || 0) * 100).toFixed(d)}%`;

/* ================================================================== */
/*  EX useMemo DEL COMPONENTE                                         */
/* ================================================================== */

export type Fiscal = "mono" | "ri";

/** El estado del formulario, tal cual lo guardan los `useState` del original (strings crudos). */
export interface EstadoEstrategia {
  costo: string;
  envio: string;
  otros: string;
  fiscal: Fiscal;
  categoria: string;
  margen: string;
  pasarelaKey: ClavePasarela;
  canalKey: ClaveCanal;
  unidades: string;
  ivaRecuperable: boolean;
  mix: Record<ClaveMedio, string>;
  planes: Record<ClaveCanal, string>;
  comisionManual: string;
  iibb: string;
  inscriptoIIBB: boolean;
  sirtac: string;
  retIVA: string;
  retGan: string;
  retencionesRecuperables: boolean;
  tasaCapital: string;
}

/** Valores iniciales de los `useState` del original. */
export const ESTADO_INICIAL: EstadoEstrategia = {
  costo: "15000",
  envio: "0",
  otros: "0",
  fiscal: "mono",
  categoria: "Hogar, muebles y jardín",
  margen: "30",
  pasarelaKey: "mp_10",
  canalKey: "ml_clasica",
  unidades: "100",
  ivaRecuperable: true,
  mix: Object.fromEntries(MEDIOS.map((m) => [m.k, String(MIX_TIPICO[m.k])])) as Record<
    ClaveMedio,
    string
  >,
  planes: Object.fromEntries(
    Object.entries(CANALES).map(([k, c]) => [k, (c.ml ? undefined : c.plan) || ""]),
  ) as Record<ClaveCanal, string>,
  comisionManual: "",
  iibb: "2",
  inscriptoIIBB: true,
  sirtac: "1,5",
  retIVA: "1",
  retGan: "3",
  retencionesRecuperables: true,
  tasaCapital: "3",
};

/** ex `const entrada = useMemo(…)`. */
export function armarEntrada(s: EstadoEstrategia): EntradaEstrategia {
  const ri = s.fiscal === "ri";
  const m = {} as Record<ClaveMedio, number>;
  MEDIOS.forEach((x) => {
    m[x.k] = num(s.mix[x.k]);
  });
  return {
    costo: num(s.costo),
    envio: num(s.envio),
    otros: num(s.otros),
    ri,
    ivaRecuperable: s.ivaRecuperable,
    categoria: s.categoria,
    canalKey: s.canalKey,
    planes: s.planes,
    pasarelaKey: s.pasarelaKey,
    mix: m,
    comisionManual: s.comisionManual.trim() === "" ? null : num(s.comisionManual),
    iibb: s.inscriptoIIBB ? num(s.iibb) : 0,
    sirtac: num(s.sirtac),
    retIVA: num(s.retIVA),
    retGan: num(s.retGan),
    retencionesRecuperables: s.inscriptoIIBB && s.retencionesRecuperables,
    tasaCapital: num(s.tasaCapital),
    margen: num(s.margen),
  };
}

export interface FilaImposible {
  k: ClaveCanal;
  imposible: true;
  sobreVenta: number;
  precio?: undefined;
  ganancia?: undefined;
  comision?: undefined;
}

export interface FilaPosible {
  k: ClaveCanal;
  imposible?: undefined;
  precio: number;
  ganancia: number;
  comision: number;
  oscila: true | undefined;
}

export type FilaRanking = FilaImposible | FilaPosible;

/** ex `const ranking = useMemo(…)`. */
export function calcularRanking(entrada: EntradaEstrategia): FilaRanking[] {
  const filas = (Object.keys(CANALES) as ClaveCanal[]).map((k): FilaRanking => {
    const s = resolverPrecio(entrada, k);
    if (s.imposible) return { k, imposible: true, sobreVenta: s.sobreVenta };
    const d = desglosar(entrada, k, s.precio);
    return {
      k,
      precio: s.precio,
      ganancia: d.gananciaFinal,
      comision: d.comision,
      oscila: s.oscila,
    };
  });
  return filas.sort((a, b) => (a.precio ?? Infinity) - (b.precio ?? Infinity));
}

export type Seleccion =
  | { imposible: true; sobreVenta: number }
  | (Desglose & { imposible?: undefined; oscila: true | undefined });

/** ex `const sel = useMemo(…)`: el desglose del canal elegido. */
export function calcularSeleccion(entrada: EntradaEstrategia, canalKey: ClaveCanal): Seleccion {
  const s = resolverPrecio(entrada, canalKey);
  if (s.imposible) return { imposible: true, sobreVenta: s.sobreVenta };
  return { ...desglosar(entrada, canalKey, s.precio), oscila: s.oscila };
}

export interface Lote {
  inversion: number;
  ganancia: number;
  recupero: number | null;
}

/** ex `const lote = useMemo(…)`. */
export function calcularLote(sel: Seleccion, costo: string, u: number): Lote | null {
  if (sel.imposible) return null;
  const inversion = num(costo) * u;
  const cajaPorVenta = sel.costoProd + sel.gananciaFinal;
  return {
    inversion,
    ganancia: sel.gananciaFinal * u,
    recupero: cajaPorVenta > 0 ? Math.ceil(inversion / cajaPorVenta) : null,
  };
}

export type TonoAviso = "riesgo" | "ojo" | "dato";

/** Lo que hacía `accion.fn` en el original: un setter del formulario. */
export type EfectoAviso = { campo: "margen"; valor: string } | { campo: "fiscal"; valor: Fiscal };

export interface Aviso {
  id: string;
  tono: TonoAviso;
  titulo: string;
  cuerpo: string;
  accion?: { texto: string; efecto: EfectoAviso };
}

export interface ContextoAvisos {
  sel: Seleccion;
  entrada: EntradaEstrategia;
  canalKey: ClaveCanal;
  ranking: FilaRanking[];
  margen: string;
  ri: boolean;
  ivaRecuperable: boolean;
  costo: string;
  u: number;
  canal: Canal;
}

const esPosible = (f: FilaRanking): f is FilaPosible => !f.imposible;

/* Motor de avisos: mira los números y señala dónde está el problema */
export function calcularAvisos({
  sel,
  entrada,
  canalKey,
  ranking,
  margen,
  ri,
  ivaRecuperable,
  costo,
  u,
  canal,
}: ContextoAvisos): Aviso[] {
  const out: Aviso[] = [];
  if (sel.imposible) return out;
  const m = num(margen);

  if (ri && m > 0) {
    const neto = m * 0.65;
    const bruto = Math.round((m / 0.65) * 10) / 10;
    out.push({
      id: "gan",
      tono: "dato",
      titulo: `Tu ${m}% se convierte en ${neto.toFixed(1)}% real`,
      cuerpo: `Como responsable inscripto pagás 35% de Ganancias sobre lo que te queda. Para llevarte ${m}% limpio al bolsillo, tenés que pedirle ${bruto}% acá.`,
      accion: { texto: `Poner ${bruto}%`, efecto: { campo: "margen", valor: String(bruto) } },
    });
  }

  if (canal.ml) {
    const arriba = resolverPrecio({ ...entrada, margen: m + 5 }, canalKey);
    if (!arriba.imposible) {
      const salto = (arriba.precio - sel.precio) / sel.precio;
      if (salto > 0.15) {
        out.push({
          id: "tramo-sube",
          tono: "riesgo",
          titulo: "Estás pegado al salto de tramo",
          cuerpo: `Subir el margen 5 puntos no te lleva a ${money(sel.precio * 1.08)}: te lleva a ${money(arriba.precio)}. Cruzás un umbral de costo fijo de ML y el precio pega un salto del ${pct(salto, 0)}. Quedate bien abajo del umbral o saltalo con ganas, pero no te pares justo ahí.`,
        });
      }
    }
    const abajo = resolverPrecio({ ...entrada, margen: Math.max(0, m - 5) }, canalKey);
    if (!abajo.imposible) {
      const caida = (sel.precio - abajo.precio) / sel.precio;
      if (caida > 0.15) {
        out.push({
          id: "tramo-baja",
          tono: "dato",
          titulo: `Resignando 5 puntos de margen, el precio baja ${pct(caida, 0)}`,
          cuerpo: `Bajando a ${m - 5}% podés publicar a ${money(abajo.precio)} en vez de ${money(sel.precio)}: caés al tramo de costo fijo anterior. Menos margen por unidad, mucho más competitivo en góndola.`,
          accion: { texto: `Probar ${m - 5}%`, efecto: { campo: "margen", valor: String(m - 5) } },
        });
      }
    }
  }

  const rojos = sel.porMedio.filter((x) => x.ganancia <= 0 && x.w > 0);
  if (rojos.length) {
    const peso = rojos.reduce((s, x) => s + x.w, 0);
    out.push({
      id: "rojos",
      tono: "riesgo",
      titulo: `${rojos.length === 1 ? "Un medio de pago te deja" : "Varios medios de pago te dejan"} en pérdida`,
      cuerpo: `${rojos.map((x) => x.n.toLowerCase()).join(", ")} — y son el ${(peso * 100).toFixed(0)}% de tus ventas. A este precio, cada una de esas ventas te resta plata. O subís el precio, o sacás esas cuotas.`,
    });
  }

  if (ri && ivaRecuperable) {
    const credito = num(costo) - num(costo) / 1.21;
    if (credito > 0) {
      out.push({
        id: "credito",
        tono: "dato",
        titulo: `${money(credito)} por unidad son crédito fiscal`,
        cuerpo: `De los ${money(num(costo))} que te cuesta, ${money(credito)} es IVA que recuperás. Sobre el lote son ${money(credito * u)}. Un monotributista con el mismo producto arranca con ese costo encima.`,
        accion: { texto: "Ver como monotributo", efecto: { campo: "fiscal", valor: "mono" } },
      });
    }
  }

  const mlB = ranking
    .filter((f): f is FilaPosible => !f.imposible && CANALES[f.k].ml)
    .sort((a, b) => a.precio - b.precio)[0];
  const prB = ranking
    .filter((f): f is FilaPosible => !f.imposible && !CANALES[f.k].ml)
    .sort((a, b) => a.precio - b.precio)[0];
  if (mlB && prB) {
    const mlAlto = ranking
      .filter((f): f is FilaPosible => !f.imposible && CANALES[f.k].ml)
      .sort((a, b) => b.ganancia - a.ganancia)[0];
    out.push({
      id: "brecha",
      tono: "ojo",
      titulo: "El precio más bajo no es el que más te deja",
      cuerpo: `En tienda propia publicás a ${money(prB.precio)} y ganás ${money(prB.ganancia)}. En ${CANALES[mlAlto.k].nombre} ${CANALES[mlAlto.k].variante.toLowerCase()} publicás a ${money(mlAlto.precio)} y ganás ${money(mlAlto.ganancia)} — ${money((mlAlto.ganancia - prB.ganancia) * u)} más sobre las ${u} unidades. La pregunta no es dónde el precio es más bajo: es dónde podés vender las ${u}.`,
    });
  }

  if (sel.finan > 0 && sel.p.dias >= 8) {
    out.push({
      id: "plazo",
      tono: "dato",
      titulo: `Estás financiando ${sel.p.dias.toFixed(0)} días de cobro`,
      cuerpo: `Te cuesta ${money(sel.finan)} por unidad, ${money(sel.finan * u)} en el lote. Si el plazo te aprieta, mirá cuánto cambia cobrando al instante: pagás más arancel pero recuperás capital.`,
    });
  }

  const orden: Record<TonoAviso, number> = { riesgo: 0, ojo: 1, dato: 2 };
  return out.sort((a, b) => orden[a.tono] - orden[b.tono]).slice(0, 4);
}

export interface EvaluacionEstrategia {
  ri: boolean;
  entrada: EntradaEstrategia;
  ranking: FilaRanking[];
  sel: Seleccion;
  canal: Canal;
  mejor: FilaPosible | undefined;
  u: number;
  lote: Lote | null;
  avisos: Aviso[];
}

/**
 * Todo lo que el render del original derivaba del estado, en el mismo orden
 * (ri → entrada → ranking → sel → canal → mejor → u → lote → avisos).
 */
export function evaluarEstrategia(s: EstadoEstrategia): EvaluacionEstrategia {
  const ri = s.fiscal === "ri";
  const entrada = armarEntrada(s);
  const ranking = calcularRanking(entrada);
  const sel = calcularSeleccion(entrada, s.canalKey);
  const canal = CANALES[s.canalKey];
  const mejor = ranking.find(esPosible);
  const u = Math.max(1, Math.round(num(s.unidades)));
  const lote = calcularLote(sel, s.costo, u);
  const avisos = calcularAvisos({
    sel,
    entrada,
    canalKey: s.canalKey,
    ranking,
    margen: s.margen,
    ri,
    ivaRecuperable: s.ivaRecuperable,
    costo: s.costo,
    u,
    canal,
  });
  return { ri, entrada, ranking, sel, canal, mejor, u, lote, avisos };
}
