// Port de vegroup@b550803 src/lib/ncmSearch.js — LITERAL.
//
// Mismo algoritmo, mismos sinónimos, mismos puntajes y mismo desempate que el
// original: search.test.ts compara SIM, orden y score contra búsquedas
// corridas con el ncmSearch.js original (test/fixtures/cotizador/
// ncm-busquedas.json). Si hay que tocar el ranking, se toca primero en el
// repo vegroup y se porta (ver ../ORIGEN.md).
//
// Sin imports de Node ni "server-only": lo usa el Client Component.
//
// ── Comentario original ──────────────────────────────────────────────────
// Búsqueda local de candidatos NCM/SIM por relevancia textual.
// Devuelve los mejores candidatos a nivel SIM para mandar a la IA (que elige
// la posición exacta). La base se carga en forma diferida (loadBase).

import type { CandidatoSim, PosicionNcm } from "../types";
import { loadBase } from "./base";

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "con",
  "para",
  "por",
  "en",
  "del",
  "al",
  "a",
  "the",
  "of",
  "and",
  "for",
  "with",
  "demas",
  "demás",
]);

// Sinónimos frecuentes ES/EN → término del nomenclador.
// Las claves se comparan en versión "stemmed" (sin plural), así que
// "zapatilla" y "zapatillas" matchean la misma entrada.
//
// Es un objeto literal común: `SYNONYMS["constructor"]` devolvería la función
// de Object.prototype. Por eso `sinonimo()` mira sólo las claves propias.
// Único desvío del original (B12-03, VGRP-69): ahí buscar "constructor" o
// "constructores" rompía con "syn.split is not a function". No cambia el
// ranking de ninguna otra búsqueda.
const SYNONYMS: Record<string, string> = {
  auricular: "auriculares audifonos",
  audifono: "auriculares audifonos",
  headphone: "auriculares audifonos",
  earbud: "auriculares audifonos",
  notebook: "portatil maquinas automaticas datos peso inferior",
  laptop: "portatil maquinas automaticas datos peso inferior",
  computadora: "maquinas automaticas datos",
  tablet: "tabletas",
  celular: "telefonos inteligentes moviles",
  smartphone: "telefonos inteligentes",
  telefono: "telefonos moviles",
  tv: "television aparatos receptores",
  televisor: "television aparatos receptores",
  monitor: "monitores",
  smartwatch: "reloj pulsera",
  reloj: "reloj pulsera",
  cargador: "cargador fuente alimentacion convertidor estatico",
  powerbank: "acumuladores litio",
  bateria: "acumuladores litio",
  pila: "pilas acumuladores",
  mochila: "mochila bolso estuche",
  cartera: "bolsos mano",
  valija: "baules maletas",
  zapatilla: "calzado deporte suela caucho plastico",
  zapato: "calzado suela cuero",
  bota: "calzado suela",
  calzado: "calzado suela",
  sandalia: "calzado suela",
  remera: "t-shirt camisetas punto algodon",
  camiseta: "t-shirt camisetas punto",
  pantalon: "pantalones",
  campera: "cazadoras anoraks abrigo",
  buzo: "sueteres pulover punto",
  jean: "pantalones algodon",
  ropa: "prendas vestir",
  media: "calzas medias punto",
  gorra: "sombreros gorras tocados",
  cosmetico: "belleza maquillaje piel",
  crema: "cremas belleza",
  maquillaje: "maquillaje belleza labios ojos",
  perfume: "perfumes aguas tocador",
  shampoo: "champues cabello",
  anteojo: "gafas sol",
  lente: "gafas sol",
  teclado: "teclados",
  mouse: "raton dispositivos entrada",
  parlante: "altavoces",
  microfono: "microfonos",
  camara: "camaras fotograficas digitales",
  drone: "aeronaves no tripuladas",
  dron: "aeronaves no tripuladas",
  juguete: "juguetes",
  peluche: "juguetes rellenos",
  bicicleta: "bicicletas",
  monopatin: "patinetes",
  herramienta: "herramientas",
  taladro: "taladros perforadoras",
  impresora: "impresoras unidades",
  consola: "videojuegos consolas maquinas",
  videojuego: "videojuegos consolas",
  termo: "termos recipientes isotermicos",
  mate: "yerba mate recipientes",
  cuchillo: "cuchillos hojas cortantes",
  olla: "articulos cocina hierro aluminio",
  sarten: "articulos cocina hierro aluminio",
  vaso: "vajilla vidrio",
  plato: "vajilla",
  toalla: "ropa tocador cocina",
  sabana: "ropa cama",
  colchon: "colchones somieres",
  silla: "asientos",
  mesa: "muebles",
  mueble: "muebles",
  lampara: "aparatos alumbrado luminarias",
  ventilador: "ventiladores",
  aire: "acondicionado maquinas",
  heladera: "refrigeradores congeladores",
  lavarropas: "maquinas lavar ropa",
  microondas: "hornos microondas",
  aspiradora: "aspiradoras",
  cafetera: "aparatos electrotermicos cafe",
  licuadora: "trituradoras mezcladoras alimentos",
  neumatico: "neumaticos caucho",
  cubierta: "neumaticos caucho",
  repuesto: "partes accesorios",
  perfumeria: "perfumes tocador belleza",
};

function normalize(str: unknown): string {
  return (
    String(str)
      .toLowerCase()
      .normalize("NFD")
      // quitar tildes. El original tiene los diacríticos combinantes pegados
      // literalmente en la clase; `̀-ͯ` es exactamente el mismo rango.
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Quita el plural español más común: "zapatillas"→"zapatilla",
// "relojes"→"reloj". No toca palabras cortas.
function stem(t: string): string {
  if (t.length > 4 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

function sinonimo(t: string): string | undefined {
  return Object.hasOwn(SYNONYMS, t) ? SYNONYMS[t] : undefined;
}

function tokens(str: unknown): string[] {
  return normalize(str)
    .split(" ")
    .flatMap((t) => {
      const s = stem(t);
      const syn = sinonimo(t) || sinonimo(s);
      return syn ? syn.split(" ").concat(t) : [t];
    })
    .filter((t) => t && t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

interface EntradaIndice {
  h: PosicionNcm;
  _tokens: Set<string>;
  _sufTokens: Set<string>[];
}

// Índice memoizado: tokens del heading + tokens de cada sufijo.
let INDEX: EntradaIndice[] | null = null;
async function buildIndex(): Promise<EntradaIndice[]> {
  if (INDEX) return INDEX;
  const headings = await loadBase();
  INDEX = headings.map((h) => ({
    h,
    _tokens: new Set(tokens(h.descripcion)),
    _sufTokens: h.suf.map((s) => new Set(tokens(s.descripcionSufijo || ""))),
  }));
  return INDEX;
}

/**
 * @param query  Producto en lenguaje natural (o código NCM/SIM).
 * @param maxSim Máximo de candidatos SIM a devolver (default 60).
 * @returns candidatos SIM [{sim, ncm, descripcion, die, te, iva, …, score}]
 */
export async function searchNCM(query: string, maxSim = 60): Promise<CandidatoSim[]> {
  const q = tokens(query);
  const index = await buildIndex();
  const qCode = normalize(query).replace(/[.\s]/g, "");

  if (q.length === 0 && !/^\d{4,}/.test(qCode)) return [];

  const scored: {
    h: PosicionNcm;
    score: number;
    sufScored: { s: PosicionNcm["suf"][number]; ss: number }[];
  }[] = [];
  for (const { h, _tokens, _sufTokens } of index) {
    let score = 0;
    for (const t of q) {
      if (_tokens.has(t)) score += 3;
      else {
        for (const rt of _tokens) {
          if (rt.startsWith(t) || t.startsWith(rt)) {
            score += 1;
            break;
          }
        }
      }
    }
    // Búsqueda directa por código NCM tipeado.
    if (/^\d{4,}/.test(qCode) && h.ncm.replace(/\./g, "").startsWith(qCode.slice(0, 8))) {
      score += 10;
    }
    if (score <= 0) continue;

    // Bonus por sufijo que también matchea (elige mejor sufijo primero).
    const sufScored = h.suf.map((s, i) => {
      let ss = 0;
      for (const t of q) if (_sufTokens[i].has(t)) ss += 2;
      return { s, ss };
    });
    sufScored.sort((a, b) => b.ss - a.ss);
    scored.push({ h, score: score + (sufScored[0]?.ss || 0), sufScored });
  }

  scored.sort((a, b) => b.score - a.score);

  // Aplanamos a nivel SIM respetando el ranking de headings.
  const out: CandidatoSim[] = [];
  for (const { score, sufScored } of scored.slice(0, 25)) {
    for (const { s, ss } of sufScored) {
      out.push({ ...s, score: score + ss });
      if (out.length >= maxSim) return out;
    }
  }
  return out;
}

/**
 * Devuelve todas las posiciones SIM cuyas partidas (4 dígitos) estén en la
 * lista. Se usa como fallback cuando la búsqueda textual no encuentra nada:
 * la IA sugiere las partidas y acá juntamos los candidatos reales.
 */
export async function searchByPartidas(
  partidas: readonly unknown[],
  maxSim = 80,
): Promise<CandidatoSim[]> {
  const headings = await loadBase();
  const lista = partidas
    .map((p) => String(p).replace(/\D/g, "").slice(0, 4))
    .filter((p) => /^\d{4}$/.test(p));
  if (lista.length === 0) return [];

  // Respetamos el orden de probabilidad de las partidas y repartimos el cupo
  // entre ellas, para que una partida con muchas aperturas no tape a las demás.
  const cupo = Math.max(12, Math.ceil(maxSim / lista.length));
  const out: CandidatoSim[] = [];
  const seen = new Set<string>();
  for (const p of lista) {
    let usados = 0;
    for (const h of headings) {
      if (h.ncm.slice(0, 4) !== p) continue;
      for (const s of h.suf) {
        if (usados >= cupo || seen.has(s.sim)) continue;
        out.push({ ...s, score: 0 });
        seen.add(s.sim);
        usados++;
      }
    }
  }
  return out.slice(0, maxSim);
}
