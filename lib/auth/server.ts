// =============================================================================
// REGLA DURA: no llamar a `supabase.auth.getUser()` en el camino de render de
// ninguna página. `getUser()` hace un roundtrip al servidor de Auth de
// Supabase en cada invocación — agrega un viaje de red por navegación. Con
// claves de firma asimétricas (ES256, ver el paso manual documentado en
// supabase/migrations/20260822035925_auth_hook.sql) verificar el JWT es CPU
// en memoria contra las claves públicas del proyecto, no un request. Es el
// error de performance más común de este stack (STACK.md §4). Usá
// `getVerifiedClaims()` de este archivo en su lugar.
// =============================================================================

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import type { AppMetadataClaims } from "./claims";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (config de Supabase).`);
  }
  return value;
}

/**
 * Cliente Supabase de servidor para Server Components / Route Handlers,
 * siguiendo el patrón estándar de `@supabase/ssr` con las cookies de
 * `next/headers`. Crear uno nuevo por request (nunca compartir una instancia
 * entre requests) — es el patrón que documenta el propio paquete.
 *
 * `setAll` puede fallar si se llama desde un Server Component puro (Next no
 * deja escribir cookies fuera de un Server Action / Route Handler); se
 * ignora ese error a propósito porque en ese camino la sesión ya se refresca
 * en el middleware (VGRP-17), no acá — ver el comentario del propio patrón
 * de @supabase/ssr.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Ver comentario de createSupabaseServerClient: esperado desde un
            // Server Component puro, el middleware (VGRP-17) es quien de
            // verdad refresca y persiste la cookie de sesión.
          }
        },
      },
    },
  );
}

/**
 * Claims verificados del usuario actual, o `null` si no hay sesión (o el JWT
 * no pasa la verificación). Usa `supabase.auth.getClaims()`, el método de
 * verificación LOCAL que expone `@supabase/supabase-js@2.112.3` /
 * `@supabase/auth-js@2.112.3` (instalado en este repo): valida la firma del
 * JWT contra las claves públicas del proyecto (cacheadas en memoria por el
 * SDK) sin pegarle al servidor de Auth. Sin argumento, `getClaims()` primero
 * resuelve la sesión (cookies, vía `getSession()`, también sin red salvo que
 * el access token esté vencido y haga falta refrescar con el refresh token)
 * y verifica ese JWT. Esto es exactamente lo que reemplaza a `getUser()` —
 * ver la regla dura al principio de este archivo.
 *
 * Devuelve el objeto `claims` tal cual lo tipa el SDK (incluye
 * `app_metadata.nivel` / `app_metadata.rol` una vez que el hook de VGRP-16
 * esté registrado en el dashboard — hasta entonces, o para tokens emitidos
 * antes de registrarlo, esas claves van a faltar y los helpers de
 * `lib/auth/claims.ts` devuelven sus defaults seguros, no explotan).
 */
export async function getVerifiedClaims(): Promise<AppMetadataClaims | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    return null;
  }

  return data.claims as AppMetadataClaims;
}
