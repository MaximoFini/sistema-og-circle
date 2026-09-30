// Port de vegroup@b550803 src/lib/api.js — wrappers de los endpoints del
// cotizador (`app/api/cotizador/*`). La clave de Anthropic vive sólo en el
// servidor; el front nunca la ve.
//
// Diferencias con el original (a propósito):
// - Sin login/token/logout: la sesión la da la cookie de la app y el
//   middleware ya gatea `/calculadora`. Por eso no hay header Authorization.
// - 401/403 a mitad de uso (se venció la sesión o se perdió el plan con la
//   página abierta): en vez del evento `vegroup:logout`, se navega a
//   `/login?next=/calculadora` o a `/comprar`. El error se lanza igual, para
//   que quien llamó corte su flujo.
// - No se portan `agentQuote` (/api/agent) ni `getDolarCDA` (/api/dolar-cda):
//   AgentQuote no los usa y no tienen endpoint acá (el CDA es de VGRP-58).
//
// Client-safe: sin "server-only". Lo importan los Client Components del
// cotizador (CotizadorCourier, ProformaUpload, MarketingAnalysis).

// ── Contratos de los endpoints ───────────────────────────────────────────

/** Candidato que se manda a identificar: `ncm` es el SIM (`c.sim`), como el original. */
export interface CandidatoIdentificacion {
  ncm: string;
  descripcion: string;
}

export interface AlternativaNcm {
  ncm: string;
  motivo?: string;
}

/** Respuesta de `identificar-ncm` (la forma que pide el prompt de api/identify.js). */
export interface IdentificacionNcm {
  ncm: string;
  confianza: number;
  razonamiento: string;
  alternativas: AlternativaNcm[];
}

/** Respuesta de `sugerir-partidas`. */
export interface SugerenciaPartidas {
  partidas: string[];
  interpretacion: string;
}

export interface CotizacionDolar {
  venta: number;
  compra: number | null;
  fecha: string | null;
  fuente: string;
}

/** Respuesta de `dolar`: BNA billete + CCL (null si la fuente falló). */
export interface RespuestaDolar extends CotizacionDolar {
  ccl: CotizacionDolar | null;
}

/**
 * Respuesta de `extraer-documento`. La IA pone `null` en lo que no encuentra
 * y el endpoint garantiza `dimensiones` como objeto.
 */
export interface DatosProforma {
  producto?: string | null;
  proveedor?: string | null;
  direccionFabricante?: string | null;
  origen?: string | null;
  incoterm?: string | null;
  fob?: number | string | null;
  pesoKg?: number | string | null;
  volumenM3?: number | string | null;
  cajas?: number | string | null;
  unidades?: number | string | null;
  dimensiones?: {
    largo?: number | string | null;
    ancho?: number | string | null;
    alto?: number | string | null;
  } | null;
  notas?: string | null;
}

/** El `resumenCostos` que arma AgentQuote y viaja como `costos` al análisis. */
export interface ResumenCostos {
  rutaMasConveniente: string;
  costoRealEfectivo: number;
  costoPorUnidad: number;
  unidades: number;
  monedaCosto: "USD";
}

/** Lo que manda MarketingAnalysis a `analisis-marketing`. */
export interface PedidoAnalisis {
  producto: string;
  ncm?: string | null;
  costos?: ResumenCostos | null;
  mercado?: string;
}

/** Respuesta de `analisis-marketing` (el endpoint normaliza los dos arrays). */
export interface AnalisisMarketing {
  publicoObjetivo?: string;
  angulosVenta: string[];
  ideasContenido: string[];
  campanaSugerida?: string;
  precioSugerido?: string;
  riesgoPrincipal?: string;
}

// ── Transporte ───────────────────────────────────────────────────────────

/** Error de un endpoint: el `error` del JSON como mensaje + el status HTTP. */
export class ErrorApi extends Error {
  /** Ausente si ni siquiera hubo respuesta (sin red). */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ErrorApi";
    this.status = status;
  }
}

/** A dónde mandar al usuario si pierde la sesión o el plan con la página abierta. */
export const DESTINO_SIN_SESION = "/login?next=/calculadora";
export const DESTINO_SIN_PLAN = "/comprar";

async function post<T>(path: string, body: unknown): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ErrorApi("No se pudo contactar al servidor de IA. Verificá tu conexión o el deploy.");
  }
  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!resp.ok) {
    // Sesión vencida o plan perdido a mitad de uso: fuera de la calculadora.
    if (resp.status === 401) window.location.assign(DESTINO_SIN_SESION);
    else if (resp.status === 403) window.location.assign(DESTINO_SIN_PLAN);
    const mensaje =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Error ${resp.status} al llamar a ${path}.`;
    throw new ErrorApi(mensaje, resp.status);
  }
  return data as T;
}

// ── Endpoints (mismos nombres que el original) ──────────────────────────

/** Identifica la posición NCM correcta entre candidatos locales. */
export function identifyNCM(
  query: string,
  candidates: CandidatoIdentificacion[],
): Promise<IdentificacionNcm> {
  return post("/api/cotizador/identificar-ncm", { query, candidates });
}

/** Sugerencia de partidas NCM (4 díg.) cuando la búsqueda local no encuentra. */
export function suggestPartidas(query: string): Promise<SugerenciaPartidas> {
  return post("/api/cotizador/sugerir-partidas", { query });
}

/** Cotización automática del dólar BNA (billete venta) + CCL. */
export function getDolarBNA(): Promise<RespuestaDolar> {
  return post("/api/cotizador/dolar", {});
}

/** Análisis de marketing/comercialización post-cálculo. */
export function analyzeProduct(payload: PedidoAnalisis): Promise<AnalisisMarketing> {
  return post("/api/cotizador/analisis-marketing", payload);
}

/** Extrae datos de una proforma/packing list (imagen o PDF en base64). */
export function extractDocument({
  fileBase64,
  mediaType,
  filename,
}: {
  fileBase64: string;
  mediaType: string;
  filename?: string;
}): Promise<DatosProforma> {
  return post("/api/cotizador/extraer-documento", { fileBase64, mediaType, filename });
}

/** Respuesta de `dolar-cda` (VGRP-58): la cotización del Centro Despachantes de Aduana. */
export interface CotizacionCda {
  fecha: string;
  compra: number;
  venta: number;
  fuente: string;
}

/**
 * Cotización del dólar del CDA (VGRP-58) — la que usa el despachante para la
 * base imponible del cotizador marítimo. Distinta de `getDolarBNA()`
 * (dolarapi.com, BNA/CCL, para courier).
 */
export function getDolarCDA(): Promise<CotizacionCda> {
  return post("/api/cotizador/dolar-cda", {});
}

/** Convierte un File del navegador a base64 (sin el prefijo data:). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}
