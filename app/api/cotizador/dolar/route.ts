// VGRP-57 — POST /api/cotizador/dolar. Port de `api/dolar.js`
// (vegroup@b550803): cotización del dólar oficial BNA (billete, venta) y CCL
// de referencia, desde dolarapi.com.
//
//   sin sesión ... 401    sin plan ... 403
//   dolarapi falla / BNA inválido ... 502 (texto del original: "Cargala a mano")
//   ok ... 200 { venta, compra, fecha, fuente, ccl: { venta, compra, fecha, fuente } | null }
//
// Caché de 10 minutos: IGUAL que el original, en memoria del módulo, y no con
// `fetch(..., { next: { revalidate: 600 } })`. Motivos:
// - la Data Cache de Next cachea cada URL por separado: un CCL caído o un BNA
//   con `venta` inválida podrían quedar cacheados 10 minutos, y el original
//   sólo guarda el par completo cuando BNA salió bien;
// - la entrada es la misma para todos los usuarios y no depende de la sesión,
//   así que no hay riesgo de cruzar datos entre usuarios con una caché de
//   módulo (el gating corre SIEMPRE antes, en cada request);
// - el costo de que cada instancia de la función tenga su propia caché es, a
//   lo sumo, un par de requests extra a dolarapi cada 10 minutos.

import { ErrorCotizador } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { responderError } from "@/lib/cotizador/server/respuestas";
import { crearTtlCache } from "@/lib/cotizador/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Cotizacion {
  venta: number;
  compra: number | null;
  fecha: string | null;
}

interface RespuestaDolar extends Cotizacion {
  fuente: string;
  ccl: (Cotizacion & { fuente: string }) | null;
}

const cache = crearTtlCache<RespuestaDolar>(10 * 60 * 1000);

async function fetchRate(url: string): Promise<Cotizacion | null> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!resp.ok) return null;
  const j = (await resp.json()) as {
    venta?: unknown;
    compra?: unknown;
    fechaActualizacion?: unknown;
  } | null;
  const venta = Number(j?.venta);
  if (!Number.isFinite(venta) || venta <= 0) return null;
  return {
    venta,
    compra: Number(j?.compra) || null,
    fecha: (j?.fechaActualizacion as string | undefined) || null,
  };
}

// Sin body: el front manda `{}` (como el original). No se lee.
export async function POST(): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const cacheado = cache.get();
  if (cacheado) return Response.json(cacheado);

  try {
    let bna: Cotizacion | null;
    let ccl: Cotizacion | null;
    try {
      [bna, ccl] = await Promise.all([
        fetchRate("https://dolarapi.com/v1/dolares/oficial"),
        fetchRate("https://dolarapi.com/v1/dolares/contadoconliqui").catch(() => null),
      ]);
    } catch (e) {
      throw new ErrorCotizador(502, "No se pudo obtener la cotización. Cargala a mano.", {
        cause: e,
      });
    }
    if (!bna) {
      throw new ErrorCotizador(502, "Cotización BNA inválida. Cargala a mano.");
    }

    const data: RespuestaDolar = {
      venta: bna.venta,
      compra: bna.compra,
      fecha: bna.fecha,
      fuente: "BNA oficial (dolarapi.com)",
      ccl: ccl
        ? { venta: ccl.venta, compra: ccl.compra, fecha: ccl.fecha, fuente: "CCL (dolarapi.com)" }
        : null,
    };
    cache.set(data);
    return Response.json(data);
  } catch (e) {
    return responderError(e, "dolar");
  }
}
