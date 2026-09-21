// VGRP-55 — helper compartido por lib/data/agentes.ts, profesionales.ts,
// servicios.ts y lib/config/index.ts (getLinks): las cuatro envuelven su
// lectura cacheada (`unstable_cache`) en el mismo try/catch, cayendo a la
// lectura sin caché si falla. Antes de este archivo, cada uno tenía su
// propia copia del mismo bloque — factorizado acá para no repetirlo una
// quinta vez con el próximo ticket.
//
// `unstable_cache` exige el runtime real de Next (Edge/Node de un server de
// verdad, con el `incrementalCache` inicializado) — tira `Invariant:
// incrementalCache missing` fuera de él. Eso pasa en dos casos MUY
// distintos, y este helper los trata distinto:
//
// 1. Un test llama el Route Handler directo, sin un server de Next arriba
//    (ver test/integration/agentes-route.test.ts). Esperado, no es una falla
//    real — no amerita mandar nada a Sentry.
// 2. Un fallo real de la caché en producción (el store de incremental cache
//    roto, un bug interno de Next, etc.). Ahí SÍ hay que enterarse: mismo
//    criterio que el fail-open de lib/data/videos.ts (captureException antes
//    de degradar), para que "la caché está permanentemente rota y cada
//    request paga el doble" no quede en silencio.
//
// No se distinguen los dos casos por tipo de excepción (el mensaje de Next
// no es un contrato estable para parsear) — se decide por variable de
// entorno: en tests (`NODE_ENV=test`) no se reporta; en cualquier otro
// entorno, sí.

import "server-only";

import * as Sentry from "@sentry/nextjs";

export async function leerConFallback<T>(
  cacheado: () => Promise<T>,
  sinCache: () => Promise<T>,
  detalle: string,
): Promise<T> {
  try {
    return await cacheado();
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      Sentry.captureException(error, {
        level: "warning",
        tags: { "cache-fallback": "true" },
        extra: {
          detalle,
          nota:
            "unstable_cache falló fuera de un test — puede ser un fallo real de la caché, " +
            "no sólo la falta de runtime de Next. Se sirvió la lectura sin caché igual.",
        },
      });
    }
    return sinCache();
  }
}
