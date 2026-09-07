// Cliente Supabase de BROWSER (VGRP-22) — mismo patrón que
// `createSupabaseServerClient()` en `lib/auth/server.ts`, pero con
// `createBrowserClient` en vez de `createServerClient`.
//
// Sin `import "server-only"` a propósito, al revés que `lib/auth/server.ts`:
// este archivo está pensado para importarse desde Client Components (hoy,
// `PendienteClient.tsx` en `app/(app)/comprar/pendiente/`) — `server-only`
// rompería el build ahí mismo.
//
// Por qué hace falta esto y no alcanza con `lib/auth/server.ts`: la pantalla
// de espera post-pago necesita refrescar el JWT DESDE EL BROWSER en cada
// tick de su polling (`supabase.auth.refreshSession()`) para que el Auth
// Hook (VGRP-16) tenga la chance de recalcular `app_metadata.nivel` una vez
// que el webhook de Mercado Pago (VGRP-23) ya haya proyectado el pago. Un
// cliente de servidor no sirve para esto: cada request de servidor lee la
// cookie tal cual llegó, no puede "refrescarla y esperar" en medio de un
// polling que vive enteramente en el cliente.
//
// -----------------------------------------------------------------------------
// BUG encontrado por VGRP-48 (E2E de pago real, `e2e/pago-aprobado-acceso.spec.ts`)
// -----------------------------------------------------------------------------
// Este archivo NO puede usar `getEnv()` (lib/env.ts) para leer las variables
// `NEXT_PUBLIC_*`: `getEnv()` hace `process.env[name]` con `name` DINÁMICO, y
// Next.js sólo puede inlinear en el bundle del browser las referencias
// LITERALES `process.env.NEXT_PUBLIC_ALGO` (reemplazo estático en build time,
// vía webpack `DefinePlugin` — no existe un `process.env` real en el
// browser). Con acceso dinámico, `process.env[name]` siempre da `undefined`
// del lado del cliente, sin importar qué haya en `.env.local` — esto rompía
// en silencio TODA build de producción de esta pantalla (nunca se detectó
// antes porque ningún test previo ejecutaba este componente contra un build
// real; los tests de integración pasan por Node, donde `process.env` sí
// existe de verdad). Por eso acá se referencia cada variable de forma
// literal y NO se reutiliza `getEnv()`.
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";

function requerirEnvPublica(valor: string | undefined, nombre: string): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. (config de Supabase)`);
  }
  return valor;
}

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    requerirEnvPublica(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requerirEnvPublica(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
