// VGRP-58 — port literal de `src/lib/tarifasMaritimo.js` (vegroup@b550803).
// Ver lib/cotizador/ORIGEN.md.
//
// ─────────────────────────────────────────────────────────────────────────
// CRITERIO DE COSTOS MARÍTIMOS — /maritimo
//
// Números definidos por Matías, el despachante (30 ago 2026). Es la única
// fuente de verdad del cotizador marítimo: si cambia una tarifa, se cambia
// acá y en ningún otro lado.
//
// No lo importa nadie de /calculadora ni de /interno: son courier aéreo, otra
// operatoria y otros números.
// ─────────────────────────────────────────────────────────────────────────

// ── Flete ────────────────────────────────────────────────────────────────
// Se cobra por TN/m³ (el mayor entre toneladas y metros cúbicos, regla de
// estiba 1 ton = 1 m³) más un cargo fijo de BL.
//
// El flete que se PAGA y el que se DECLARA en aduana no son el mismo número:
// al despacho va el 70% del pagado. Eso baja el CIF y con él los derechos, la
// estadística y todo lo que cuelga de la base imponible. El pagado es el que
// entra a gastos operativos, porque es lo que el cliente desembolsa.
export const FLETE = {
  porM3: 250,
  bl: 300, // documento + gastos portuarios + TERMINAL PORTUARIA — todo adentro
  declaradoPct: 70, // % del flete pagado que se declara en aduana
  kgPorTonelada: 1000,
};

// ── Seguro ───────────────────────────────────────────────────────────────
// Siempre 1% sobre FOB + flete. Sin mínimo.
export const SEGURO_PCT = 1;

// ── Gastos fijos ─────────────────────────────────────────────────────────
// Son los mismos en toda importación, no dependen del embarque, y todos
// llevan IVA 21% — que se factura como UN solo ítem al final porque al
// cliente se le hace factura A.
export interface GastoFijo {
  key: string;
  label: string;
  monto: number;
}

export const FIJOS: GastoFijo[] = [
  { key: "depositoFiscal", label: "Depósito fiscal", monto: 300 },
  { key: "gastosBancarios", label: "Gastos bancarios", monto: 300 },
  { key: "digitalizacion", label: "Digitalización", monto: 30 },
  { key: "honorarios", label: "Honorarios despacho", monto: 300 },
  { key: "gastosOperativos", label: "Gastos operativos", monto: 150 },
  { key: "asesoramiento", label: "Asesoramiento", monto: 700 },
  { key: "verificacion", label: "Verificación aduanera", monto: 150 },
];

export const IVA_SERVICIOS = 21; // %
export const SUMA_FIJOS = FIJOS.reduce((a, f) => a + f.monto, 0); // US$ 1.930
export const IVA_FIJOS = (SUMA_FIJOS * IVA_SERVICIOS) / 100; // US$ 405,30

// ── Gravámenes ───────────────────────────────────────────────────────────
// Los derechos, la estadística y la alícuota de IVA salen de la posición SIM.
// Las percepciones las paga siempre el importador.
export const PERCEPCIONES = {
  ivaAdicional: 20,
  ganancias: 6,
  iibb: 2.5,
};
export const ARANCEL_SIM = 10; // USD fijos por despacho

// ── Contenedores ─────────────────────────────────────────────────────────
// Capacidad ESTIBABLE real, no la nominal del catálogo. Se usa para decir en
// qué contenedor entra la carga en la cotización de marítimo full.
export interface Contenedor {
  id: string;
  label: string;
  cbm: number;
  pesoMax: number;
}

export const CONTENEDORES: Contenedor[] = [
  { id: "20", label: "20' Dry", cbm: 28, pesoMax: 28000 },
  { id: "40", label: "40' Dry", cbm: 58, pesoMax: 26500 },
  { id: "40hq", label: "40' High Cube", cbm: 66, pesoMax: 26500 },
];

// El flete de contenedor completo lo cotiza el despachante por WhatsApp: no
// hay tarifa publicada. Mientras tanto la cotización full se arma con la
// misma tarifa por m³ y se muestra el aviso con el enlace al chat.
//
// Matías, despachante. +54 9 3564 61-1474 — wa.me lo quiere sin +, sin
// espacios y sin guiones.
export const WHATSAPP_DESPACHANTE = "5493564611474";

// ── Puertos de carga ─────────────────────────────────────────────────────
export interface Puerto {
  id: string;
  label: string;
  pais: string;
  transito: number;
}

export const PUERTOS: Puerto[] = [
  { id: "qingdao", label: "Qingdao", pais: "CN", transito: 47 },
  { id: "shanghai", label: "Shanghái", pais: "CN", transito: 45 },
  { id: "shenzhen", label: "Shenzhen", pais: "CN", transito: 42 },
];

export const PUERTO_DESCARGA = { label: "Buenos Aires", pais: "AR" };

export interface SugerenciaPuerto {
  puerto: string;
  motivo: string;
}

/**
 * Sugiere el puerto de carga más cercano a la dirección del fabricante.
 *
 * China se parte en tres cuencas de exportación y cada fábrica despacha por
 * la suya: norte → Qingdao, centro/Yangtsé → Shanghái, sur → Shenzhen. Se
 * resuelve por provincia y por ciudad, sin IA: el mapa es fijo y una llamada
 * al modelo por cada tecla sería cara y lenta.
 */
export function sugerirPuerto(direccion: unknown): SugerenciaPuerto | null {
  const t = normalizar(direccion);
  if (!t) return null;

  for (const { puerto, claves, region } of MAPA_PUERTOS) {
    const hit = claves.find((k) => t.includes(k));
    if (hit) return { puerto, motivo: `${capitalizar(hit)} — ${region}` };
  }
  return null;
}

// Provincias primero y después ciudades: si la dirección dice "Shandong",
// alcanza sin importar de qué pueblo sea la fábrica.
const MAPA_PUERTOS: Array<{ puerto: string; region: string; claves: string[] }> = [
  {
    puerto: "qingdao",
    region: "norte de China",
    claves: [
      "shandong",
      "hebei",
      "beijing",
      "pekin",
      "tianjin",
      "henan",
      "shanxi",
      "shaanxi",
      "liaoning",
      "jilin",
      "heilongjiang",
      "inner mongolia",
      "mongolia interior",
      "gansu",
      "qingdao",
      "jinan",
      "yantai",
      "weifang",
      "zibo",
      "linyi",
      "weihai",
      "rizhao",
      "dezhou",
      "jining",
      "taian",
      "binzhou",
      "dongying",
      "liaocheng",
      "heze",
      "zaozhuang",
      "shijiazhuang",
      "baoding",
      "tangshan",
      "langfang",
      "handan",
      "cangzhou",
      "xingtai",
      "zhengzhou",
      "luoyang",
      "xuchang",
      "nanyang",
      "anyang",
      "xinxiang",
      "taiyuan",
      "datong",
      "xian",
      "xi an",
      "baoji",
      "lanzhou",
      "dalian",
      "shenyang",
      "anshan",
      "jinzhou",
      "changchun",
      "harbin",
      "hohhot",
    ],
  },
  {
    puerto: "shanghai",
    region: "centro y cuenca del Yangtsé",
    claves: [
      "shanghai",
      "jiangsu",
      "zhejiang",
      "anhui",
      "jiangxi",
      "hubei",
      "hunan",
      "chongqing",
      "sichuan",
      "suzhou",
      "wuxi",
      "nanjing",
      "changzhou",
      "nantong",
      "yangzhou",
      "zhenjiang",
      "xuzhou",
      "yancheng",
      "huaian",
      "lianyungang",
      "kunshan",
      "zhangjiagang",
      "hangzhou",
      "ningbo",
      "wenzhou",
      "jinhua",
      "yiwu",
      "shaoxing",
      "jiaxing",
      "huzhou",
      "quzhou",
      "lishui",
      "taizhou",
      "zhoushan",
      "hefei",
      "wuhu",
      "bengbu",
      "anqing",
      "nanchang",
      "jiujiang",
      "ganzhou",
      "wuhan",
      "yichang",
      "xiangyang",
      "changsha",
      "zhuzhou",
      "hengyang",
      "chengdu",
      "mianyang",
    ],
  },
  {
    puerto: "shenzhen",
    region: "sur de China",
    claves: [
      "guangdong",
      "guangxi",
      "fujian",
      "hainan",
      "yunnan",
      "guizhou",
      "hong kong",
      "hongkong",
      "macau",
      "macao",
      "shenzhen",
      "guangzhou",
      "canton",
      "dongguan",
      "foshan",
      "zhongshan",
      "zhuhai",
      "huizhou",
      "jiangmen",
      "shantou",
      "chaozhou",
      "jieyang",
      "zhanjiang",
      "shaoguan",
      "qingyuan",
      "zhaoqing",
      "maoming",
      "yangjiang",
      "meizhou",
      "heyuan",
      "shanwei",
      "xiamen",
      "quanzhou",
      "fuzhou",
      "putian",
      "zhangzhou",
      "ningde",
      "nanning",
      "liuzhou",
      "guilin",
      "beihai",
      "haikou",
      "sanya",
      "kunming",
      "guiyang",
    ],
  },
];

function normalizar(s: unknown): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca tildes: "Shanghái" → "shanghai"
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizar(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ── Formato ──────────────────────────────────────────────────────────────
export function fmtUSD(n: number | null | undefined): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? (n as number) : 0);
}

export function fmtARS(n: number | null | undefined): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? (n as number) : 0);
}

export function fmtPct(n: number | null | undefined, dec = 2): string {
  return `${(Number.isFinite(n) ? (n as number) * 100 : 0).toFixed(dec).replace(".", ",")}%`;
}

export function fmtNum(n: number | null | undefined, dec = 2): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(Number.isFinite(n) ? (n as number) : 0);
}

export function num(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v.replace(",", ".")) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
