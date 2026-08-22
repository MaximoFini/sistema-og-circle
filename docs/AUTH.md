# Auth — VGRP-16

Cómo queda armada la capa de autenticación después de este ticket. No incluye
enrutamiento/middleware (eso es VGRP-17, el ticket siguiente).

## 1. El JWT lleva `app_metadata.nivel` y `app_metadata.rol`

Un Custom Access Token Hook de Supabase Auth
(`supabase/migrations/20260822035925_auth_hook.sql`,
`public.custom_access_token_hook`) se ejecuta cada vez que Auth emite un
access token (login, refresh) y le agrega dos claims a `app_metadata` leyendo
la fila de `public.profiles` del usuario:

- `app_metadata.nivel`: `'ninguno' | 'principiante' | 'avanzado'`
- `app_metadata.rol`: `'user' | 'admin'`

Con esto, decidir qué mostrar (nivel del dashboard, si el usuario es admin)
es leer un claim ya verificado en memoria — cero queries a la base en el
camino de render. Es la pieza central de STACK.md §4.

**El hook no se activa solo.** Hace falta un paso manual en el dashboard de
Supabase (Authentication → Hooks → Customize Access Token → seleccionar
`custom_access_token_hook`) y migrar el proyecto a claves de firma asimétricas
ES256 (Project Settings → JWT Keys). Ninguno de los dos es una migración SQL.
Ver el comentario grande al principio de
`supabase/migrations/20260822035925_auth_hook.sql` y la sección 8 de
`docs/SUPABASE-SETUP.md`.

Si un usuario tiene un token viejo, emitido antes de que el hook estuviera
activo, esos claims van a faltar. `lib/auth/claims.ts` maneja ese caso sin
explotar: ver la sección 3.

## 2. El problema del refresco tras un pago

El claim `app_metadata.nivel` sólo se recalcula cuando Auth **emite** un
token nuevo (login o refresh) — no reacciona a cambios en `profiles` en
tiempo real. Esto genera un caso concreto:

1. Un usuario paga. El webhook de MercadoPago (bloque de pagos, ticket
   aparte) inserta la fila en `pagos` y eso hace que `nivel_vigente()` (ver
   `supabase/migrations/20260822035923_init_plataforma.sql`) devuelva el
   nivel nuevo.
2. Pero el usuario sigue con la cookie de sesión vieja: su JWT actual
   todavía tiene el `app_metadata.nivel` de **antes** de pagar, porque ese
   token se firmó antes de la compra.
3. Si en ese momento se lo manda al dashboard, el claim viejo lo bloquea de
   contenido que ya pagó — aunque la base ya sepa que tiene acceso.

**Mecanismo elegido:** la pantalla de espera post-pago (a construir en el
Bloque 3) hace polling del estado del pago hasta verlo `approved`, y en ese
momento — una sola vez, antes de redirigir al dashboard — llama a
`supabase.auth.refreshSession()`. Eso fuerza a Auth a emitir un token nuevo,
lo que dispara el hook de nuevo y trae el `nivel` actualizado en el claim.
Recién ahí se redirige.

No se resuelve con un refresco automático/periódico en background ni con
un `setInterval` en todo el dashboard: el único momento en que se sabe con
certeza que el claim puede estar desactualizado es ese, justo después de
confirmar el pago, así que ahí es donde se paga el costo del refresh y en
ningún otro lado.

## 3. Qué expone `lib/auth/`

### `lib/auth/claims.ts` — helpers puros, sin I/O

- `getNivel(claims)` → `NivelAcceso`. Lee `app_metadata.nivel`; si falta o
  no es un valor válido del enum (token viejo, hook no registrado todavía,
  etc.) devuelve `'ninguno'` — el mismo default que la columna en la base.
  Nunca lanza.
- `getRol(claims)` → `RolUsuario`. Mismo criterio, default `'user'`.
- `hasNivel(claims, minimo)` → `boolean`. Compara contra el orden
  `ninguno < principiante < avanzado`. Pensado para gating futuro
  (middleware de VGRP-17, guards de página/Server Action).

Los tipos `NivelAcceso` / `RolUsuario` se reexportan desde acá pero vienen de
`lib/database.types.ts` — no hay strings de los enums duplicados en ningún
otro lado.

### `lib/auth/server.ts` — cliente de servidor + claims verificados

- `createSupabaseServerClient()`: cliente `@supabase/ssr` para Server
  Components / Route Handlers, leyendo/escribiendo cookies vía
  `next/headers`. Crear uno nuevo por request, nunca reusar una instancia.
- `getVerifiedClaims()`: devuelve los claims del JWT actual ya verificados
  localmente (`supabase.auth.getClaims()`), o `null` si no hay sesión. **No
  llama a `supabase.auth.getUser()`** — ver la regla dura documentada arriba
  del archivo.

### Uso típico desde un Server Component

```ts
import { getVerifiedClaims } from "@/lib/auth/server";
import { getNivel, hasNivel } from "@/lib/auth/claims";

export default async function DashboardPage() {
  const claims = await getVerifiedClaims();
  const nivel = getNivel(claims);

  if (!hasNivel(claims, "principiante")) {
    // mostrar upsell / redirigir, según defina VGRP-17
  }

  return <Shell nivel={nivel} />;
}
```

## 4. Qué falta (siguientes tickets)

- **VGRP-17**: `middleware.ts` — enrutamiento basado en estos mismos claims
  (proteger `(app)`, redirigir según nivel). Depende de este ticket, no
  implementado acá a propósito.
- Registrar el hook y migrar a claves ES256 en el dashboard (paso manual,
  ver sección 1).
- Bloque 3: pantalla de espera post-pago que llama a `refreshSession()`
  (sección 2).
