// VGRP-58 — POST /api/cotizador/dolar-cda. Port de `api/dolar-cda.js`
// (vegroup@b550803): cotización del dólar del Centro Despachantes de Aduana
// (cda.org.ar), que es la que usa el despachante para armar la base
// imponible del cotizador marítimo. NO es la misma fuente que
// `app/api/cotizador/dolar/route.ts` (BNA/CCL de dolarapi.com, para courier):
// ese endpoint sigue igual, sin tocar.
//
//   sin sesión ... 401    sin plan ... 403
//   fetch falla ... 502 "No se pudo leer la cotización del CDA. Cargala a mano."
//   tabla sin filas (markup cambiado) ... 502 "El CDA respondió pero no se
//     pudo leer la tabla (¿cambió el sitio?). Cargá la cotización a mano."
//   ok ... 200 { fecha, compra, venta, fuente }
//
// Caché de 30 minutos (el CDA publica una vez por rueda) — misma caché con
// TTL que usa `dolar/route.ts` (lib/cotizador/server/ttlCache.ts).
// `Cache-Control: private, no-store` ya lo pone `next.config.ts` para todo
// `/api/cotizador/:path*`; no hace falta repetirlo acá.
//
// El front sólo usa la última fila del historial (no `historial` completo),
// a diferencia del original: ver "Interfaces / contracts" en
// specs/bloque-12-calculadoras/design-vgrp58.md.

import { ErrorCotizador } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { responderError } from "@/lib/cotizador/server/respuestas";
import { crearTtlCache } from "@/lib/cotizador/server/ttlCache";
import { type FilaHistorial, parseHistorial } from "./parseHistorial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const URL_HISTORIAL = "https://www.cda.org.ar/historial_dolar.php";

interface RespuestaDolarCda {
  fecha: string;
  compra: number;
  venta: number;
  fuente: string;
}

const cache = crearTtlCache<RespuestaDolarCda>(30 * 60 * 1000);

// Sin body: el front manda `{}` (como el original). No se lee.
export async function POST(): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const cacheado = cache.get();
  if (cacheado) return Response.json(cacheado);

  try {
    let html: string;
    try {
      const resp = await fetch(URL_HISTORIAL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OGCircle-cotizador/1.0)" },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    } catch (e) {
      throw new ErrorCotizador(502, "No se pudo leer la cotización del CDA. Cargala a mano.", {
        cause: e,
      });
    }

    const historial = parseHistorial(html);
    if (historial.length === 0) {
      throw new ErrorCotizador(
        502,
        "El CDA respondió pero no se pudo leer la tabla (¿cambió el sitio?). Cargá la cotización a mano.",
      );
    }

    const hoy = historial[0] as FilaHistorial;
    const data: RespuestaDolarCda = {
      fecha: hoy.fecha,
      compra: hoy.compra,
      venta: hoy.venta,
      fuente: "Centro Despachantes de Aduana (cda.org.ar)",
    };
    cache.set(data);
    return Response.json(data);
  } catch (e) {
    return responderError(e, "dolar-cda");
  }
}
