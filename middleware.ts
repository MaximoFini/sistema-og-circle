// =============================================================================
// VGRP-17 / Bloque 2 — Middleware de sesión + gating de acceso FAIL-CLOSED.
//
// Por qué este archivo tiene SU PROPIO cliente de Supabase en vez de
// reusar `createSupabaseServerClient()` / `getVerifiedClaims()` de
// `lib/auth/server.ts`:
//
// Ese módulo lee/escribe cookies con `cookies()` de `next/headers`, una API
// que sólo funciona dentro del contexto de request de Server Components,
// Server Actions y Route Handlers. El Middleware de Next.js corre ANTES de
// ese contexto (Edge runtime, firma `(request: NextRequest) => NextResponse`)
// y no tiene acceso a `next/headers` — es el propio patrón oficial de
// `@supabase/ssr` para Next.js el que pide un cliente separado en
// `middleware.ts`, construido sobre `request.cookies` / `response.cookies`
// en vez de `next/headers`. Ver:
// https://supabase.com/docs/guides/auth/server-side/nextjs (sección
// Middleware).
//
// Lo que SÍ se respeta de `lib/auth/server.ts` es la regla dura: nunca se
// llama a `supabase.auth.getUser()` (roundtrip de red por request). Acá,
// igual que en `getVerifiedClaims()`, se usa `supabase.auth.getClaims()`,
// que verifica el JWT localmente contra las claves públicas del proyecto.
// No hay parsing de cookies ni de JWT a mano en ningún lado de este
// archivo — todo pasa por `@supabase/ssr`.
//
// -----------------------------------------------------------------------------
// LA INVERSIÓN (lo importante de este archivo)
// -----------------------------------------------------------------------------
// Antes, el matcher era una lista literal de rutas privadas
// (`matcher: ["/dashboard/:path*"]`). Eso es FAIL-OPEN: toda página nueva
// bajo `app/(app)/` nacía PÚBLICA hasta que alguien se acordara de sumarla al
// array. Los route groups (`(app)`, `(auth)`, `(legal)`) no dejan rastro en
// la URL, así que no hay un prefijo tipo `/app/*` que matchear — el olvido no
// tiene red de contención. Con las grillas de agentes de compra y los datos
// SWIFT entrando en bloques siguientes, un olvido ahí publica el producto.
//
// Ahora es al revés y es FAIL-CLOSED: el middleware corre sobre TODAS las
// rutas (menos assets estáticos) y **lo único que se enumera acá es lo
// PÚBLICO** (`PUBLIC_ROUTES`). Todo lo que no esté en esa lista exige sesión.
//
// Consecuencia práctica: agregar una ruta privada nueva NO requiere tocar
// este archivo. Sólo se toca para hacer PÚBLICA una ruta — que es
// exactamente la decisión que amerita pensarla dos veces.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "./lib/database.types";

/**
 * Rutas alcanzables SIN sesión, por IGUALDAD EXACTA.
 *
 * Acá van los endpoints puntuales: nada que cuelgue por debajo hereda el
 * permiso. Es lo que corresponde para un webhook — que un handler anidado
 * futuro naciera público sería exactamente el fail-open que este archivo
 * viene a eliminar, y encima en la superficie de API.
 */
const PUBLIC_EXACT = new Set([
  // La raíz no tiene contenido propio: `app/page.tsx` sólo hace
  // `redirect("/dashboard")` (la landing vive en otro deploy). Dejarla pasar
  // no ahorra saltos, pero hace que el `next` que se guarda sea `/dashboard`
  // —el destino real— en vez de `/`, que al volver del login rebotaría de
  // nuevo por ahí.
  //
  // Es además la razón por la que este Set existe: `/` como prefijo sería un
  // comodín que volvería público el sitio entero.
  "/",

  // Hook de envío de mails de Supabase. No trae cookie de sesión: se
  // autentica con su propia firma (standardwebhooks) dentro del handler.
  // Va como exacto y no como prefijo `/api/auth` porque bajo esa carpeta van
  // a vivir handlers de sesión (logout, etc.) que sí tienen que estar
  // gateados.
  "/api/auth/send-email",
]);

/**
 * Rutas alcanzables SIN sesión, ellas y TODO lo que cuelgue por debajo.
 * Match por segmento: `/recuperar` cubre `/recuperar/nueva`, nunca
 * `/recuperarcosas`.
 *
 * Cada entrada tiene un motivo; si no lo tiene, no va acá.
 */
const PUBLIC_PREFIXES = [
  // --- Auth: quien las visita, por definición, todavía no tiene sesión ---
  "/login", //     VGRP-18
  "/registro", //  VGRP-18
  "/recuperar", // VGRP-19 — cubre también `/recuperar/nueva`
  // El link que llega por email en el flujo de reset de contraseña. Quien lo
  // clickea NO tiene sesión (es justamente lo que viene a recuperar): si esta
  // ruta pidiera sesión, el reset no funcionaría nunca. Todavía no existe en
  // el árbol — la crea VGRP-19; se lista desde ya para que ese ticket no
  // tenga que volver a tocar este archivo.
  "/auth/callback",

  // CONVENCIÓN: todo webhook entrante nuevo (Mercado Pago, etc.) va bajo
  // `/api/webhooks/`. Si se respeta, este archivo no se toca nunca más. Se
  // abre este prefijo y NO `/api` entero: abrir todo `/api` haría que
  // cualquier handler futuro con datos del usuario naciera público.
  "/api/webhooks",

  // --- Legales (`app/(legal)/`): son públicas por definición; suelen
  // linkearse desde la landing y desde el pie del registro, antes de que
  // exista una cuenta. El contenido lo entrega Jota (ver CONTEXT.md).
  "/terminos",
  "/privacidad",
  "/reembolsos",
  "/legales",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Copia a `destino` las cookies que `@supabase/ssr` haya escrito en la
 * respuesta pass-through.
 *
 * Hace falta en todo camino que NO devuelve esa respuesta. `getClaims()`
 * puede rotar el refresh token: si en ese request devolvemos un redirect (o
 * un 401) construido de cero, la cookie nueva se pierde, y el browser se
 * queda con un refresh token ya consumido — o sea, el usuario se desloguea
 * solo. Es la receta estándar de `@supabase/ssr`: las cookies acompañan a
 * cualquier respuesta que se retorne, no sólo al `NextResponse.next()`.
 */
function withRefreshedCookies(destino: NextResponse, origen: NextResponse): NextResponse {
  for (const cookie of origen.cookies.getAll()) {
    destino.cookies.set(cookie);
  }
  return destino;
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (config de Supabase).`);
  }
  return value;
}

export async function middleware(request: NextRequest) {
  // Respuesta "pass-through" por default. Si `setAll` de abajo se dispara
  // (Supabase necesita refrescar el access token con el refresh token), se
  // reemplaza por una nueva `NextResponse` que además lleva las cookies de
  // sesión actualizadas — así el refresh de sesión llega al browser en la
  // misma respuesta, sin request extra.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Se llama SIEMPRE, también en rutas públicas: es lo que refresca el access
  // token vencido y persiste la cookie nueva (vía `setAll`). Si sólo corriera
  // en rutas privadas, una sesión que pasa un rato en `/login` o en los
  // legales volvería con el token vencido.
  //
  // Costo: para un visitante anónimo (crawler, alguien mirando los legales)
  // no hay cookie de sesión, así que esto resuelve en memoria y sin red. El
  // roundtrip sólo aparece cuando hay un refresh token real que canjear, que
  // es exactamente el caso en el que queremos pagarlo.
  //
  // REGLA DURA (ver lib/auth/server.ts): `getClaims()`, nunca `getUser()`.
  const { data, error } = await supabase.auth.getClaims();
  // `!data` y no `data !== null`: sin sesión, `getClaims()` devuelve `data`
  // como `undefined`, no como `null`. Comparar contra `null` daría "hay
  // sesión" para todo visitante anónimo — o sea, exactamente lo contrario del
  // fail-closed de este archivo. Mismo criterio que `getVerifiedClaims()` en
  // lib/auth/server.ts.
  const haySesion = !error && !!data;

  const { pathname } = request.nextUrl;

  // Público: pasa con o sin sesión, ya con las cookies refrescadas.
  if (isPublicRoute(pathname)) {
    return response;
  }

  if (!haySesion) {
    // Un Route Handler privado no puede contestar con un redirect a HTML: el
    // cliente que lo llama espera JSON, y `fetch` sigue los redirects sin
    // avisar, así que un 307 a `/login` se le presenta como un 200 con una
    // página adentro. Se responde 401, que es lo que el caller sabe manejar.
    if (pathname.startsWith("/api/")) {
      return withRefreshedCookies(
        NextResponse.json({ error: "No autenticado." }, { status: 401 }),
        response,
      );
    }

    const loginUrl = new URL("/login", request.url);
    // Se preserva el destino original (path + querystring) para que el login
    // devuelva al usuario a donde iba y no siempre al dashboard. Lo consume
    // `safeRedirectPath()` de `lib/auth/redirect.ts`, que valida que sea un
    // path relativo nuestro antes de redirigir — sin esa validación, este
    // parámetro sería un open redirect.
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return withRefreshedCookies(NextResponse.redirect(loginUrl), response);
  }

  return response;
}

// El matcher es un patrón NEGATIVO: corre sobre todo salvo lo que se excluye
// explícitamente. Eso es lo que hace posible el gating fail-closed de arriba
// (una ruta nueva ya nace cubierta).
//
// Lo único excluido son assets que no tienen nada que proteger y sobre los
// que no queremos pagar la verificación de JWT en cada request:
//
// - `_next` entero (`/static`, `/image`, y lo que Next agregue): son build
//   outputs, no rutas de la app.
// - `favicon.ico`, y los archivos de imagen/fuente servidos desde la raíz de
//   `public/` (hoy: `hero-poster.jpg`, `moon-2k.jpg`).
//
//   OJO con el `[^/]*` de esa alternativa: acota la exclusión a UN solo
//   segmento. Con `.*` (que cruza barras) quedaría afuera del middleware
//   cualquier ruta que termine en esas extensiones a cualquier profundidad —
//   `/dashboard/reportes/anual.webp`, `/api/agentes/123/factura.png`, o un
//   `[slug]` cuyo valor termine en `.svg` — o sea, un bypass de sesión
//   sondeable desde afuera. Si algún día hay assets en subcarpetas de
//   `public/`, se agregan por prefijo (`imagenes|fuentes|…`), nunca
//   aflojando esto a `.*`.
// - `robots.txt` y `sitemap.xml`: los pide un crawler, que por definición no
//   tiene sesión. Sin esta exclusión el crawler recibiría un redirect a
//   `/login` en vez del archivo.
//
// Los nombres literales van cerrados con `(?:/|$)` para que la exclusión sea
// por SEGMENTO y no por prefijo de texto: sin eso, `_next` también dejaría
// afuera `/_nextcosa`, y `robots.txt` dejaría afuera `/robots.txt.algo` —
// rutas inventables desde afuera que quedarían sin gating de sesión.
//
// Todo lo demás entra al middleware, y ahí manda `PUBLIC_ROUTES`.
export const config = {
  matcher: [
    "/((?!(?:_next|favicon\\.ico|robots\\.txt|sitemap\\.xml)(?:/|$)|[^/]*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
