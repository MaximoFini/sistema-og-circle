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

## 5. VGRP-18 — Registro y login con email y contraseña

Implementa `app/(auth)/login/`, `app/(auth)/registro/` y las Server Actions
de `app/(auth)/_actions.ts` (`iniciarSesion`, `registrarse`), validadas con
los esquemas Zod de `app/(auth)/_schemas.ts` (frontera de confianza real:
el form del cliente valida con el mismo esquema para dar feedback
inmediato, pero la Server Action vuelve a correr `.safeParse()` sobre el
`FormData` crudo).

### Enumeración de emails

Con "Confirm email" **apagado** en el dashboard de Supabase (decisión de
producto ya tomada — sin eso, un usuario sin pagar nunca llegaría a probar
la plataforma), `signUp()` con un email que ya existe se comporta distinto
de `signUp()` con un email nuevo (falla en vez de crear cuenta y devolver
sesión). Esa fuga de "este email ya existe" es **inevitable** en el
registro dado ese trade-off: no hay forma de que el registro sea
indistinguible de un duplicado sin, a la vez, hacer que un usuario nuevo no
quede logueado tras registrarse.

Mitigación aplicada (no es un cierre completo del canal, es la mejor opción
dado el trade-off de arriba):

- **Login**: el mensaje es SIEMPRE genérico —
  *"Email o contraseña incorrectos."* — sin distinguir "el email no existe"
  de "la contraseña está mal". Acá la enumeración sí importa de verdad: no
  hay ningún trade-off de UX que la justifique, así que no se filtra nada.
- **Registro**: *"No pudimos crear la cuenta con ese email. Si ya tenés
  cuenta, iniciá sesión."* — mismo mensaje para cualquier error de
  `signUp()` (email duplicado, password rechazada por Supabase, etc.). No
  confirma nada de más en el texto, pero como se explica arriba, el canal de
  timing/side-effects (¿hubo sesión nueva o no?) sigue siendo, en teoría,
  observable. Cerrarlo del todo requeriría prender "Confirm email" (y
  entonces ningún registro deja sesión activa, duplicado o no) — decisión
  de producto que está fuera del alcance de este ticket.

**Señal para verificar en el dashboard:** si `signUp()` deja de devolver
`data.session` para un registro nuevo, es la señal de que "Confirm email"
volvió a estar prendido — revisar Authentication → Sign In / Up →
**User Signups** (no está en el modal de configuración del proveedor
Email, es una sección aparte) en el dashboard de Supabase.

**✅ Verificado (2026-08-23):** "Confirm email" estaba prendido por
default (todo proyecto nuevo de Supabase arranca así) y se detectó
probando `signUp()` directo contra la API de Auth — devolvía usuario sin
`access_token` ni `session`. Se apagó a mano en el dashboard. Repetido el
mismo `signUp()` después: devuelve sesión completa, y el JWT ya trae
`app_metadata: {"nivel":"ninguno","rol":"user"}` — confirma de paso que el
Auth Hook de VGRP-16 (Bloque 1) también sigue andando en producción, no
sólo en el código. Verificado también que el trigger de `profiles` sigue
creando la fila correspondiente. Gate 1.3 del Bloque 2 cerrado.

### Rate limit

Se usa el rate limiting nativo de Supabase Auth — **no** se agregó
`@upstash/ratelimit` ni ninguna librería de rate limiting en este repo; es
configuración del dashboard, no código. Verificar en
**Authentication → Rate Limits**:

- **Sign-in requests** (por IP): protege `iniciarSesion` contra fuerza
  bruta de contraseña.
- **Sign-up requests** (por IP): protege `registrarse` contra creación
  masiva de cuentas / abuso del mail de bienvenida.
- **Token refresh requests**: cubre el refresh que hace `middleware.ts`
  (VGRP-17) en cada request con sesión — límites default de Supabase suelen
  alcanzar, pero vale confirmarlos si el tráfico crece.

Los límites concretos (cuántos intentos por ventana) no están documentados
acá a propósito: son un valor operativo que se ajusta desde el dashboard
según el tráfico real, no una constante del código.

## 6. VGRP-19 — Recuperación de contraseña

Implementa `app/(auth)/recuperar/` (pide el email), `app/auth/callback/`
(canjea el `code` del mail por sesión) y `app/(auth)/recuperar/nueva/`
(define la contraseña nueva), más `solicitarReset` y `definirNuevaPassword`
en `app/(auth)/_actions.ts`.

**Alcance de este ticket: el flujo y las pantallas, no la plantilla del
mail.** Hoy el mail de recuperación sale con la plantilla **por defecto** de
Supabase (genérica, en inglés) porque el Send Email Hook de VGRP-25 sigue
sin registrarse (ver `docs/EMAIL.md`, "Pasos manuales pendientes" — el hook
no se activa hasta tener dominio + SPF/DKIM verificados). La plantilla
propia la implementa VGRP-26 en el Bloque 3. Es un estado interino
aceptable: el link funciona igual, sólo cambia el texto/diseño del mail.

### El callback (`app/auth/callback/route.ts`)

Route Handler, no Server Component: es el destino de
`resetPasswordForEmail({ redirectTo: "<origin>/auth/callback" })`. Quien lo
visita no tiene sesión — es lo que viene a recuperar — así que está en
`PUBLIC_PREFIXES` de `middleware.ts` (VGRP-17 ya lo dejaba pre-cargado).
Usa `supabase.auth.exchangeCodeForSession(code)`: si el canje sale bien, ya
hay sesión y se redirige a `/recuperar/nueva`; si falla, se redirige igual
pero con `?error=usado|vencido|invalido` para que esa pantalla muestre el
mensaje correspondiente.

**Cómo quedaron distinguidos los tres estados (no los tres son igual de
"limpios" — el código fuente del Route Handler documenta esto en detalle):**

- **`vencido`**: Supabase verifica el `token_hash` en su propio
  `/auth/v1/verify` *antes* de que el callback vea nada. Si ese `token_hash`
  ya no es válido, Supabase redirige acá con `?error=...&error_code=...` en
  vez de `?code=...`. **Este mismo caso agrupa "vencido por tiempo" y "el
  link ya se clickeó una vez antes"**: Supabase manda el mismo
  `error_code=otp_expired` para los dos — el primer click ya invalida el
  `token_hash`, así que un segundo click lo encuentra "no más válido" por la
  misma razón que uno vencido por tiempo. No hay forma honesta de separar
  esos dos casos con la información que Supabase da en este punto del flujo.
- **`usado`**: sí se pudo distinguir con confianza, pero es un caso más
  angosto de lo que el nombre sugiere: `code` presente (Supabase **acaba**
  de verificar el `token_hash` y emitir un code nuevo) pero
  `exchangeCodeForSession()` igual falla. Un code recién emitido fallando
  por vencimiento no tiene sentido temporal — el escenario plausible es que
  esta MISMA URL de callback (este `code` puntual) ya se haya canjeado
  antes: doble carga de la pestaña, back + reload, dos pestañas abiertas
  desde el mismo click. Es decir: re-clickear el mail viejo cae en
  `vencido`, no en `usado` — `usado` es específicamente sobre la URL de
  callback en sí.
- **`invalido`**: ni `code` ni ningún `error*` reconocible en el
  querystring. Link editado a mano, o navegación directa a `/auth/callback`
  sin pasar por ningún mail real.

### `/recuperar/nueva`

Antes de mostrar el form, la página resuelve el estado en este orden: (1) si
viene `?error=`, muestra el mensaje correspondiente y no renderiza el form
(no hay sesión en ninguno de los tres casos de arriba); (2) si no hay
`error` pero tampoco hay sesión (`getVerifiedClaims()` devuelve `null` —
por ejemplo, alguien navega directo a la URL sin pasar por el callback), se
trata igual que un link inválido; (3) recién con sesión confirmada se
muestra el form. `definirNuevaPassword` llama a
`supabase.auth.updateUser({ password })`, que no rompe la sesión que dejó el
callback — al terminar se redirige directo a `/dashboard`, nunca a
`/login`.

### Enumeración de emails (recuperación)

Mismo principio que en VGRP-18 (sección 5), aplicado acá con una diferencia
importante: `resetPasswordForEmail()` de Supabase **ya no revela nada por su
cuenta** (a diferencia de `signUp()`, que sí fuga por su propio
comportamiento). Por eso `solicitarReset` directamente **no lee** el
`error` que devuelve esa llamada — inspeccionarlo y bifurcar el mensaje
según lo que diga sería recrear a mano la fuga que Supabase ya evita. El
mensaje mostrado es siempre el mismo, exista o no la cuenta:

> "Si el email está registrado, te mandamos un link para recuperar tu
> contraseña."

Lo único que sí se distingue es un error real de red/config (Supabase
inalcanzable, no se pudo determinar el host del request) — eso no tiene
relación con si la cuenta existe, así que no hay tensión con lo anterior.

### Rate limit

Igual que en VGRP-18: rate limiting nativo de Supabase, nada de
`@upstash/ratelimit` ni librería propia. Verificar en dashboard →
**Authentication → Rate Limits**:

- **Reset password requests** (o el nombre equivalente que use el dashboard
  para el flujo de recuperación) — es el límite específico de este ticket:
  protege `solicitarReset` contra que alguien spamee de pedidos de reset a
  un email ajeno (aunque no filtre si la cuenta existe, sigue siendo abuso
  del envío de mails).
- **Token refresh requests** ya estaba cubierto por VGRP-18 y también aplica
  acá: `exchangeCodeForSession()` en el callback emite tokens nuevos.

### `middleware.ts`

No se tocó — no se encontró ningún bug real. `/recuperar` y `/auth/callback`
ya estaban en `PUBLIC_PREFIXES` desde VGRP-17/18 (dejados pre-cargados a
propósito para este ticket), y el matcher por prefijo de `/recuperar` ya
cubre `/recuperar/nueva` sin necesidad de agregar una entrada aparte.

### El dashboard bloqueado (`app/(app)/dashboard/page.tsx`)

Lee `getVerifiedClaims()` + `getNivel()`. Si `nivel === 'ninguno'` (el
estado más común de este bloque: usuario registrado sin pagar) muestra un
card con el mensaje de "todavía no tenés acceso" y un botón "Comprar
acceso" que **no lleva a ningún lado todavía** — el checkout es Bloque 3.
Para cualquier otro nivel, muestra "Tenés acceso {nivel}" — el contenido
real del dashboard por nivel es de bloques posteriores. `app/(app)/layout.tsx`
sigue sin tocarse: sigue sin leer cookies/claims, tal como pide su propio
comentario (VGRP-17).
