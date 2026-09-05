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

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { getEnv } from "../env";

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    getEnv("NEXT_PUBLIC_SUPABASE_URL", "(config de Supabase)"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "(config de Supabase)"),
  );
}
