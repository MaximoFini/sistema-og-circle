// VGRP-24a — cliente de Supabase con la service role key, para código de
// PRODUCCIÓN que necesita bypassear RLS: el webhook de Mercado Pago (VGRP-23)
// escribe pagos y actualiza `profiles.nivel`/`app_metadata` de CUALQUIER
// usuario (no sólo el propio), y el panel de admin (activación manual,
// reproceso) necesita exactamente lo mismo.
//
// `import "server-only"` de entrada: este cliente tiene privilegios totales
// sobre la base (bypasea toda política de RLS) y JAMÁS debe poder llegar al
// bundle de cliente — si algún día un archivo de cliente lo importa por
// error, el build de Next tiene que explotar ahí, no en producción.
//
// Esto es DISTINTO del cliente admin de test (`test/helpers/db-client.ts`,
// `createTestAdminClient()`): ese vive bajo `test/`, tiene un guard
// (`assertTestRuntime()`) que exige `NODE_ENV=test` y sólo lo usan los tests
// de integración, el seed y la limpieza. Este archivo es el que corresponde
// usar desde Route Handlers, Server Actions o scripts de servidor reales —
// no tiene guard porque en producción no hay ningún "modo test" que chequear,
// y agregar uno acá sólo movería el problema (¿quién audita que el guard no
// se relaje?) sin resolverlo. La barrera real es `import "server-only"`.
//
// Un cliente nuevo por invocación (mismo patrón que
// `createSupabaseServerClient()` en `lib/auth/server.ts`): no hay estado de
// sesión que compartir (`autoRefreshToken: false, persistSession: false`,
// como en el cliente de test) y crearlo es barato.

import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { getEnv } from "../env";

const SERVICE_ROLE_HINT =
  "El cliente de service role lo necesita el webhook de Mercado Pago y el panel de admin " +
  "para escribir pagos/profiles de cualquier usuario, bypaseando RLS.";

/**
 * Cliente Supabase con privilegios de service role. Bypasea RLS a propósito:
 * quien lo usa (webhook, admin panel) necesita escribir `pagos` y
 * `profiles.nivel`/`rol` de usuarios que no son el que está autenticado en el
 * request — algo que ningún cliente con la anon key puede hacer por diseño.
 *
 * Usar SOLO desde Route Handlers, Server Actions o scripts de servidor.
 * Nunca pasarlo a un Server Component que renderice datos de usuario, y nunca
 * exponerlo (directa o indirectamente) a código de cliente.
 */
export function createServiceRoleClient() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL", SERVICE_ROLE_HINT);
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_HINT);

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
