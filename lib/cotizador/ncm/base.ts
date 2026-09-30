// Port de vegroup@b550803 src/data/ncm.js.
//
// Única diferencia de comportamiento con el original: la base se baja con
// `fetch` de /cotizador/ncm-2026-1.json (public/, detrás del middleware) en
// vez del `import('./ncm.json')`, para que los 5,5 MB no terminen envueltos
// en un chunk JS (design-vgrp57 → "Base NCM en el navegador"). Lo que se
// hace con los datos una vez bajados (tupleToRecord, índice por SIM, getNcm)
// es literal.
//
// Sin imports de Node ni "server-only": lo usa el Client Component.
//
// ── Comentario original ──────────────────────────────────────────────────
// BASE DE DATOS NCM/SIM (tablas oficiales PCRAM + VUCE) — VEGROUP
//
// `ncm.json` lo genera scripts/parse-maestro.mjs a partir de
// MAESTRO_NCM_2026_1.xlsx (PCRAM + VUCE cruzados). Contiene ~10.500
// posiciones NCM de 8 dígitos, cada una con sus sufijos SIM (~33.000
// posiciones totales) y alícuotas VIGENTES:
//
//   { ncm: "8518.30.00", descripcion: "…", suf: [
//       [sufijo, desc, die, te, iva, ivaAd, lic, antidumping, impInternos]
//   ] }
// ─────────────────────────────────────────────────────────────────────────

import type {
  BaseNcmCruda,
  PosicionNcm,
  PosicionNcmCruda,
  RegistroSim,
  TuplaSufijoCruda,
} from "../types";

/**
 * URL pública de la base. El nombre lleva la versión (MAESTRO 2026-1): una
 * base nueva es un archivo nuevo, y eso es lo que permite servirlo con
 * `Cache-Control: immutable`.
 */
export const URL_BASE_NCM = "/cotizador/ncm-2026-1.json";

let _headings: PosicionNcm[] | null = null; // [{ncm, descripcion, suf:[{...}]}]
let _bySim: Map<string, RegistroSim> | null = null; // Map "8518.30.00.100U" → registro plano

// Memo de la descarga en curso. El original no lo necesitaba (el módulo del
// `import()` ya lo cachea el bundler); con `fetch`, dos llamadas simultáneas
// (searchNCM + searchByPartidas arrancan juntas en AgentQuote) bajarían la
// base dos veces.
let _descarga: Promise<PosicionNcm[]> | null = null;

/** Carga (una sola vez) la base completa. */
export async function loadBase(): Promise<PosicionNcm[]> {
  if (_headings) return _headings;
  if (!_descarga) {
    _descarga = fetch(URL_BASE_NCM)
      .then(async (res) => {
        if (!res.ok) throw new Error(`No se pudo cargar la base NCM (HTTP ${res.status}).`);
        return cargarBaseDesdeDatos((await res.json()) as BaseNcmCruda);
      })
      .catch((err: unknown) => {
        // Sin esto, un fallo de red dejaría la promesa rechazada memoizada
        // para siempre; así el próximo intento vuelve a pedir el archivo.
        _descarga = null;
        throw err;
      });
  }
  return _descarga;
}

/**
 * Arma los índices a partir del JSON crudo (el cuerpo de loadBase() del
 * original, sin el `import()`). loadBase() la usa después del `fetch`; los
 * tests la llaman directo con el archivo leído del disco, porque en Node no
 * hay una URL relativa a la que hacerle `fetch`. Pisa lo que hubiera cargado.
 */
export function cargarBaseDesdeDatos(raw: BaseNcmCruda): PosicionNcm[] {
  _headings = raw.map((h) => ({
    ncm: h.ncm,
    descripcion: h.descripcion,
    suf: h.suf.map((t) => tupleToRecord(h, t)),
  }));
  _bySim = new Map();
  for (const h of _headings) {
    for (const s of h.suf) _bySim.set(s.sim, s);
  }
  return _headings;
}

function tupleToRecord(
  h: PosicionNcmCruda,
  [suf, desc, die, te, iva, ivaAd, lic, ad, impInternos]: TuplaSufijoCruda,
): RegistroSim {
  return {
    sim: `${h.ncm}.${suf}`, // posición SIM completa (la que usa el despachante)
    ncm: h.ncm,
    sufijo: suf,
    descripcion: desc ? `${desc}. ${h.descripcion}` : h.descripcion,
    descripcionSufijo: desc,
    die,
    te,
    iva,
    ivaAd,
    lic,
    antidumping: ad && ad !== "0" ? ad : "",
    impInternos,
  };
}

/**
 * Busca un registro por código: acepta posición SIM completa
 * ("8518.30.00.100U") o NCM de 8 dígitos ("8518.30.00", devuelve su primer
 * sufijo). Requiere que la base ya esté cargada (loadBase()).
 */
export function getNcm(code: unknown): RegistroSim | null {
  if (!_bySim || !_headings) return null;
  const c = String(code).trim();
  const exact = _bySim.get(c);
  if (exact) return exact;
  const h = _headings.find((x) => x.ncm === c);
  return h ? h.suf[0] : null;
}

/** Etiquetas conocidas de códigos de intervención/licencia de importación. */
export const LIC_LABELS: Record<string, string> = {
  CS: "Certificación de seguridad de producto (seguridad eléctrica)",
  AO: "Intervención ANMAT (salud / cosmética / alimentos)",
  E: "Requisito de etiquetado / intervención textil",
  O: "Intervención de organismo (SENASA u otro)",
};

export function licLabel(code: string | null | undefined): string {
  if (!code) return "";
  return LIC_LABELS[code] || `Intervención aduanera código "${code}"`;
}
