# Emails transaccionales — VGRP-25

Cómo manda emails OG Circle: Resend + React Email, con las plantillas como
componentes (STACK.md §1 y §7).

## Estado actual (2026-08-22) — leer esto antes de tocar nada

**Todo el código está escrito y testeado. Nada está activo, y activarlo hoy
rompería la app.**

| Pieza | Estado |
|---|---|
| Código (`lib/email/`, `emails/`, `app/api/auth/send-email/`) | ✅ Hecho en este ticket |
| Dominio propio | ❌ No existe. La landing vive en `vegroup.vercel.app` |
| Cuenta de Resend + API key | ❌ Pendiente (paso manual) |
| SPF y DKIM verificados | ❌ Pendiente, bloqueado por el dominio |
| Send Email Hook registrado en Supabase | ❌ Pendiente **a propósito** — ver abajo |
| Sentry para los fallos de envío | ❌ Entra en VGRP-41 (Bloque 3) |

### El riesgo que ordena todo este ticket

`vegroup.vercel.app` es un subdominio de Vercel: **no se pueden crear registros
SPF ni DKIM ahí**. Sin dominio verificado, Resend entrega a **una sola casilla**,
la del dueño de la cuenta de Resend, y descarta el resto en silencio.

Al mismo tiempo, el Send Email Hook de Supabase es **excluyente**: en el momento
exacto en que se registra en el dashboard, **Supabase deja de mandar sus propios
emails** y pasa a llamar únicamente a nuestro endpoint.

Juntando las dos cosas:

> Si el hook se registra antes de verificar el dominio, la recuperación de
> contraseña **se rompe para todos los usuarios reales**: Supabase ya no manda, y
> nosotros solo podemos entregar a una casilla.

**Regla de secuencia, sin saltear pasos:**

```
comprar dominio → alta en Resend → SPF + DKIM en el DNS → VERIFICADO en Resend
  → recién ahí, registrar el hook en Supabase
```

Hasta ese momento, el email por defecto de Supabase sigue activo y funciona. No
hay ninguna urgencia por registrar el hook: no arregla nada que hoy esté roto.

---

## Arquitectura: Send Email Hook, no Custom SMTP

Supabase ofrece dos formas de cambiar sus emails, y la decisión ya está tomada.

- **Custom SMTP** — Supabase sigue armando el email con sus plantillas de texto
  en el dashboard, y solo cambia por dónde sale.
- **Send Email Hook (elegido)** — Supabase deja de mandar y hace POST a un
  endpoint nuestro con los datos del email. Nosotros renderizamos la plantilla
  con React Email y enviamos por Resend.

Se eligió el hook porque es lo único coherente con STACK.md §7: *"plantillas como
componentes, mismo lenguaje que el resto"*. Con SMTP las plantillas quedarían
como HTML pegado en un textarea del dashboard de Supabase — sin tipos, sin
revisión de código, sin historial en git. **Esta decisión no se reabre.**

El precio de esa elección es exactamente el riesgo de la sección anterior: el
hook es excluyente, SMTP no.

## Qué hay en el repo

```
lib/email/client.ts                 cliente Resend + from/reply-to  (server-only)
lib/email/send.ts                   enviarEmail() — el único punto de envío
lib/email/send.test.ts
emails/_layout.tsx                  layout base, estilos inline
emails/reset-password.tsx           plantilla de recuperación de contraseña
app/api/auth/send-email/route.ts    el Send Email Hook
app/api/auth/send-email/route.test.ts
```

### `enviarEmail()` — la firma que van a usar los otros módulos

```ts
import { enviarEmail } from "@/lib/email/send";

const resultado = await enviarEmail({
  para: "usuario@ejemplo.com",
  asunto: "Restablecé tu contraseña de OG Circle",
  plantilla: ResetPasswordEmail({ url, codigo }),
  motivo: "reset-password", // contexto para el log del fallo
});
// resultado: { ok: true; id: string | null } | { ok: false; error: string }
```

**`enviarEmail()` nunca lanza. Nunca.** Ni con Resend caído, ni sin API key, ni
con la cuota agotada, ni con un error de render. La promesa siempre se resuelve
con `{ ok }`. No hace falta envolverla en un `try/catch`; si lo hacés, está de
más.

Esto es criterio explícito del PRD §5.2 (*"el envío de email nunca bloquea la
respuesta del webhook"*) y va a importar de verdad en el **Bloque 3**: cuando el
webhook de MercadoPago use este helper, **si el email falla el pago se tiene que
procesar igual**. Un `throw` ahí significaría que alguien pagó, se le acreditó el
acceso, y el webhook devolvió 500 — con lo cual MP reintenta y se duplica el
procesamiento. El peor bug posible del sistema (STACK.md §8).

Ojo con la asimetría: **el hook de este ticket sí devuelve 500 si el envío
falla**, porque ahí el email es el único propósito del request y un 200 sería un
fallo silencioso (el usuario ve "revisá tu mail" y no le llega nada nunca). En el
webhook de MP es al revés: se ignora el `{ ok: false }` y se sigue.

### Seguridad del endpoint

`/api/auth/send-email` es una superficie **pública**: cualquiera puede hacerle
POST. Sin verificar la firma, cualquier persona podría hacer que la plataforma
mande emails con nuestro remitente, nuestro branding y links arbitrarios, a
direcciones arbitrarias — una máquina de phishing con reputación de dominio
incluida.

Supabase firma el payload con el estándar
[Standard Webhooks](https://www.standardwebhooks.com/) (headers `webhook-id`,
`webhook-timestamp`, `webhook-signature`). El endpoint verifica **antes de
cualquier otra cosa** y falla cerrado:

| Situación | Respuesta | ¿Manda email? |
|---|---|---|
| Firma inválida, ausente, o payload alterado | `401` | No |
| Falta `SEND_EMAIL_HOOK_SECRET` | `500` | No |
| `SEND_EMAIL_HOOK_SECRET` con formato inválido | `500` | No |
| Payload que no valida contra el schema | `400` | No |
| `email_action_type` sin plantilla implementada | `400` | No |
| Todo bien | `200` | Sí |

La verificación de Standard Webhooks incluye el timestamp, así que también cubre
el replay de un payload viejo capturado.

**Allowlist del `redirect_to`.** El destino al que vuelve el usuario después del
reset viene dentro del payload. La firma ya garantiza que el payload es de
Supabase, así que esto no protege de un atacante externo — protege de una mala
configuración: si la lista de "Redirect URLs" del proyecto queda demasiado
abierta, el endpoint terminaría metiendo un destino arbitrario dentro de un email
firmado con nuestro dominio, que es justo la pieza que le falta a un phishing
creíble. Regla: solo se acepta un `redirect_to` del **mismo origen** que
`site_url`; cualquier otro se descarta y se cae a `site_url`.

**Falta implementar `signup`, `magiclink`, `invite` y `email_change`.** Hoy solo
existe `recovery`. Como el hook es excluyente, registrarlo con los otros tipos sin
implementar haría fallar el registro de usuarios. Esos tipos devuelven `400`
explícito en vez de `200` mudo, justamente para que el problema se vea.

### Diseño de las plantillas

Tres restricciones que no son preferencias de estilo (detalle largo en el
comentario de `emails/_layout.tsx`):

1. **Todo inline.** Los clientes de correo no cargan hojas externas ni entienden
   CSS Modules. Los valores de DESIGN.md están duplicados como constantes JS en
   `_layout.tsx` a propósito. La fuente de la verdad de la paleta sigue siendo
   DESIGN.md / `app/tokens.css`.
2. **Nada crítico dentro de una imagen.** Los clientes que bloquean imágenes son
   la norma. El logo de OG Circle en los emails es **texto** con letter-spacing,
   no un `<img>`: se ve igual con imágenes bloqueadas y no depende de un asset
   hosteado en un dominio que todavía no tenemos.
3. **Sin webfonts.** Montserrat y Helvetica Now Var no cargan en clientes de
   correo. Se usan stacks con fallback de sistema; en la práctica se ve en
   Arial/Helvetica y está bien.

Además: los colores van en **hex plano, no `rgba()`**. DESIGN.md expresa la
jerarquía de texto como alfas de blanco, pero Outlook desktop (motor de Word)
ignora `rgba()` y pinta el texto en negro sobre negro. Cada constante de
`_layout.tsx` es el color de DESIGN.md ya compuesto contra su fondo.

Mobile: contenedor con `maxWidth: 560px` + `width: 100%`, sin media queries (la
mitad de los clientes tampoco las soporta).

### Instrumentación de fallos

`reportarFalloDeEmail(motivo, error)` en `lib/email/send.ts` es el **único** punto
por donde se reporta un fallo de **entrega**. Hoy hace `console.error`.

Los problemas de **configuración o validación** del hook (secreto ausente o mal
formado, payload inválido, tipo sin plantilla) van por `reportarProblemaDeHook()`,
que vive en el route handler y es deliberadamente distinto: cuando entre Sentry,
mezclar "Resend no entregó" con "el webhook está mal configurado" en el mismo
evento haría que las dos alertas se tapen entre sí.

Un caso concreto de diagnóstico honesto: un `SEND_EMAIL_HOOK_SECRET` con formato
inválido devuelve **500** ("mal configurado"), no 401 ("firma inválida"). Si
devolviera 401, quien está registrando el hook por primera vez creería que el
problema está del lado de Supabase.

**TODO(VGRP-41):** reemplazar el cuerpo por `Sentry.captureException()`. Sentry
no está instalado en el repo — entra en VGRP-41 (Bloque 3, STACK.md §8). Este
ticket deja el punto de enganche con nombre propio y nada más; no instala el
paquete ni inventa la integración.

Un email que no sale es un fallo **silencioso** por definición: el usuario no ve
nada y el flujo sigue andando. Sin esta instrumentación, "nunca lanzar" se
convierte en "nunca enterarse".

---

## Variables de entorno

Están en `.env.example`. Ninguna está seteada hoy.

| Variable | Qué es | De dónde sale |
|---|---|---|
| `RESEND_API_KEY` | API key de Resend | Dashboard de Resend → API Keys |
| `SEND_EMAIL_HOOK_SECRET` | Secreto del hook, formato `v1,whsec_...` | Supabase → Authentication → Hooks, al crear el hook |
| `EMAIL_FROM` | Remitente | **Decisión abierta**, depende del dominio |
| `EMAIL_REPLY_TO` | Reply-to | **Decisión abierta**, depende del dominio |
| `NEXT_PUBLIC_SUPABASE_URL` | Ya existía; se usa para armar el link de reset | `docs/SUPABASE-SETUP.md` |

Sin `EMAIL_FROM`, se usa `OG Circle <onboarding@resend.dev>` (remitente de prueba
de Resend). Sin `RESEND_API_KEY`, `enviarEmail()` devuelve `{ ok: false }` y
reporta — no explota.

### Pendiente de decidir: `from` y `reply-to`

**No están definidos y no se inventaron acá.** Dependen del dominio que se
compre. Lo que hay que decidir cuando exista:

- El `from` (algo del estilo `OG Circle <no-reply@<dominio>>`).
- Si el `reply-to` va a una casilla que alguien **realmente lee**. Un mail
  transaccional con `reply-to` a un buzón muerto es peor que no tener reply-to:
  la gente responde pidiendo ayuda y nadie contesta. Si no hay quien lo lea,
  mejor dejar `EMAIL_REPLY_TO` vacío y que el email diga a dónde escribir.
- Si conviene un subdominio dedicado (`mail.<dominio>`) para aislar la reputación
  del transaccional de la del correo humano.

---

## Cómo probar HOY, sin dominio

Se puede probar todo el camino salvo la entrega a terceros.

1. **Crear una cuenta en Resend** y generar una API key. Ponerla en `.env.local`
   como `RESEND_API_KEY`. No hace falta agregar ningún dominio.
2. **Dejar `EMAIL_FROM` vacío**, así se usa `onboarding@resend.dev`, el remitente
   de prueba de Resend.
3. **Mandarse el mail a uno mismo.** El modo de prueba de Resend **solo entrega a
   la dirección de email con la que se creó la cuenta**. Cualquier otro
   destinatario es aceptado por la API y descartado: en el dashboard de Resend
   aparece el intento, pero no llega a ninguna casilla. Si "no llega el mail",
   revisar esto primero.
4. Para probar el endpoint completo hace falta un payload firmado. La forma más
   rápida es mirar `app/api/auth/send-email/route.test.ts`, que arma un pedido
   firmado con la librería real — se puede copiar ese armado a un script y
   apuntarlo a `http://localhost:3000/api/auth/send-email` con `pnpm dev`
   corriendo y `SEND_EMAIL_HOOK_SECRET` seteada a cualquier valor
   `v1,whsec_<base64>`.
5. Para iterar sobre el diseño de la plantilla sin mandar nada, se puede agregar
   el preview server de React Email (`react-email dev`). **No está instalado** en
   este ticket a propósito: es una dependencia de desarrollo pesada y todavía hay
   una sola plantilla.

**Lo que NO se puede probar hoy:** entrega a un usuario real, SPF/DKIM, reputación
del dominio, y el hook de verdad (registrarlo rompería producción — ver arriba).

---

## Pasos manuales pendientes, en orden

Ninguno de estos se puede hacer desde el repo. Van en este orden y **el paso 5 no
se hace hasta que el 4 esté verde**.

1. **Comprar el dominio.** Decisión del equipo, todavía no tomada. Mientras no
   exista, todo lo demás está bloqueado.
2. **Alta del dominio en Resend.** Dashboard de Resend → Domains → Add Domain.
   Resend devuelve los registros DNS a cargar.
3. **Cargar SPF y DKIM en el DNS del dominio** (en el registrador, o en Vercel si
   el DNS se delega ahí). Resend indica los valores exactos:
   - **SPF** — registro `TXT` de tipo `MX`/`TXT` en el subdominio de envío,
     autorizando a Resend a mandar en nombre del dominio.
   - **DKIM** — registro `TXT` con la clave pública con la que Resend firma cada
     email.
   - Conviene además un **DMARC** (`_dmarc`, empezando en `p=none` para observar
     antes de endurecer).
   Sin SPF y DKIM, el mail transaccional cae en spam. STACK.md §7 es explícito:
   *"un email transaccional que cae en spam se lee como 'me cobraron y no me llegó
   nada'"*.
4. **Verificar en Resend.** Domains → Verify. Esperar a que el dominio figure
   como verificado. La propagación de DNS puede tardar; no seguir hasta verlo.
5. **Recién ahora: registrar el Send Email Hook en Supabase.**
   Dashboard → Authentication → Hooks → **Send Email** → HTTP endpoint →
   `https://<dominio>/api/auth/send-email`. Copiar el secreto que genera Supabase
   (formato `v1,whsec_...`) a `SEND_EMAIL_HOOK_SECRET` en las env vars de Vercel
   **antes** de activar el hook.

   ⚠️ **Antes de este paso**, además del dominio verificado, tienen que estar
   implementadas las plantillas de `signup`, `magiclink`, `invite` y
   `email_change`. Hoy solo existe `recovery`, y el hook es excluyente.

6. **Setear `EMAIL_FROM` y `EMAIL_REPLY_TO`** en Vercel con los valores que decida
   el equipo (ver "Pendiente de decidir").
7. **Probar el flujo real** con un usuario de verdad: pedir reset, verificar que
   el mail llega, que no cae en spam, y que el link funciona.

### Si algo sale mal después de registrar el hook

Se puede **desactivar el hook** desde el mismo panel (Authentication → Hooks) y
Supabase vuelve a mandar sus emails por defecto de inmediato. Es la vía de escape
y no requiere ningún deploy.

---

## Deuda conocida

- **Link de confirmación — verificar end-to-end al activar.** El reset apunta a
  `<SUPABASE_URL>/auth/v1/verify?token=<token_hash>&type=recovery&redirect_to=…`,
  que es lo que resuelve `{{ .ConfirmationURL }}` en las plantillas por defecto:
  el parámetro se llama `token` pero lo que va adentro es el **`token_hash`** del
  payload, no el código de 6 dígitos. Esto **no está probado contra un proyecto
  vivo** y ningún test lo cubre (los tests solo verifican el origen del redirect).
  Es lo primero que hay que probar a mano en el paso 7 de los pasos manuales.
  Cuando exista una ruta `/auth/confirm` que reciba `token_hash` y llame a
  `supabase.auth.verifyOtp()`, conviene migrar: es el camino recomendado para el
  flujo PKCE y deja el control del redirect del lado nuestro.
- **`RESEND_API_KEY` es bloqueante una vez registrado el hook.** Sin la key,
  `enviarEmail()` devuelve `{ ok: false }` y el endpoint responde 500, así que
  **todos** los resets fallarían a la vista del usuario. Es coherente con el fail
  closed del ticket, pero significa que la key tiene que estar seteada en Vercel
  antes de activar el hook, no después.
- **Solo hay una plantilla** (`recovery`). Faltan `signup`, `magiclink`, `invite`
  y `email_change`, y son bloqueantes para registrar el hook.
- **Sentry** — VGRP-41, ver "Instrumentación de fallos".
- **Preview de React Email** no instalado (ver "Cómo probar hoy", punto 5).
