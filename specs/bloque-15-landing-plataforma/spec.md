# Bloque 15 — Landing → Plataforma: registro con Google y plataforma borrosa sin plan

> Estado: **borrador para aprobar** · Autor: Máximo Fini · Fecha: 2026-10-04
> Repos afectados: `sistema-og-circle` (este, `plataforma.ogcircle.com.ar`) y `og-circle-landing-v2` (`ogcircle.com.ar`).

## 1. Problema

Hoy la landing no lleva a la plataforma: los CTA "Quiero Aprender" son anclas internas y los de Precios abren WhatsApp. El visitante interesado no tiene cómo crear una cuenta ni ver qué hay adentro antes de pagar, y el que se registra sin plan ve una tarjeta vacía ("Todavía no tenés acceso"), que no muestra el valor del producto. Además, el botón "Continuar con Google" existe pero está deshabilitado, así que el registro exige completar un formulario de 5 campos y eso frena la conversión.

## 2. Objetivos

1. **Todo CTA de la landing lleva a la plataforma:** los 5 botones apuntan a `plataforma.ogcircle.com.ar/registro`.
2. **Registro en un clic con Google:** se puede crear la cuenta e iniciar sesión con Google, sin formulario.
3. **El usuario sin plan "ve" la plataforma sin poder usarla:** Inicio y Calculadora se muestran con su contenido real, muy borroso y no interactivo, con una tarjeta de desbloqueo encima. **Ningún dato sensible llega al navegador.**
4. **Al pagar se desbloquea todo**, sin pasos extra, con el flujo actual de Mercado Pago.
5. **Saber de dónde viene cada registro** (qué botón de la landing, o si entró directo).

## 3. Fuera de alcance

| Fuera de alcance | Por qué |
|---|---|
| Actualizar la sección Precios de la landing (sigue mostrando 2 planes) | Decisión del 2026-10-04: se arregla después, en otro ticket. |
| Sacar el login con email y contraseña | Se mantiene como alternativa a Google. |
| Pantalla de onboarding post-Google | Se eligió la opción B: los Términos se aceptan junto al botón de Google y el teléfono se pide en `/comprar`. |
| Otros proveedores OAuth (Apple, Facebook) | Sin pedido del negocio. |
| Analytics de embudo (eventos, dashboards, Vercel Analytics custom events) | Alcanza con guardar el origen en la base y verlo en el admin. |
| Cambios al botón flotante de WhatsApp | Queda igual. |

## 4. Historias de usuario

**Visitante de la landing**
- Como visitante, quiero que "Quiero Aprender" o "Anotarme" me lleven a crear mi cuenta, para entrar a la plataforma sin pasar por WhatsApp.
- Como visitante, quiero registrarme con mi cuenta de Google, para no completar un formulario.
- Como visitante que ya tiene sesión abierta, quiero que el botón me lleve directo a mi Inicio, para no ver el registro de nuevo.

**Usuario registrado sin plan**
- Como usuario sin plan, quiero ver cómo es la plataforma por dentro (aunque esté borrosa), para entender qué compro.
- Como usuario sin plan, quiero ver el precio y un botón para comprar encima del contenido, para desbloquearlo cuando decida.
- Como usuario sin plan, quiero navegar el menú y ver mi Perfil con normalidad, para sentir que mi cuenta ya existe.
- Como usuario que entró con Google, quiero que me pidan el teléfono recién cuando voy a pagar, para no frenar el registro.

**Usuario que acaba de pagar**
- Como usuario que pagó, quiero que la plataforma se desbloquee sola al volver de Mercado Pago, para empezar a usarla.

**Administrador**
- Como admin, quiero ver de qué botón de la landing vino cada usuario, para saber qué CTA convierte.

## 5. Requisitos

### P0 — Sin esto no se lanza

**R1. CTAs de la landing → registro con origen** *(repo landing)*
- Los 5 CTA (`Quiero Aprender` del nav de desktop, del hero y del menú mobile; `Anotarme en Principiante` y `Anotarme en Avanzado` en Precios) apuntan a `https://plataforma.ogcircle.com.ar/registro?origen=<id>`.
- Valores de `origen`: `landing-nav`, `landing-hero`, `landing-menu-mobile`, `landing-precios-principiante`, `landing-precios-avanzado`.
- Se abren en la misma pestaña. El texto de los botones no cambia. WhatsApp flotante sin cambios.
- La URL base sale de una constante única, no repetida en 5 lugares.

**R2. Login y registro con Google**
- Los botones "Continuar con Google" de `/login` y `/registro` se habilitan y llaman a `supabase.auth.signInWithOAuth({ provider: "google" })`. Se saca "Próximamente".
- Callback propio para OAuth (el `/auth/callback` actual es solo para recuperar contraseña y siempre redirige a `/recuperar/nueva`; no se toca). Hace `exchangeCodeForSession` y redirige a `next` (validado con `safeRedirectPath`) o a `/dashboard`.
- En el primer ingreso con Google:
  - `profiles.nombre` se completa con el `full_name` de Google si estaba vacío.
  - Se registra la aceptación de Términos (los mismos campos que el registro con email).
- Junto al botón de Google, en `/registro` y `/login`, va un texto legal: "Al continuar con Google aceptás los Términos y Condiciones y la Política de Privacidad" (con links).
- Si un email ya registrado con contraseña entra con Google, termina en **la misma cuenta** (linking automático de Supabase con email verificado), no en un usuario nuevo.
- Si hay error o cancelación en Google, se vuelve a `/login` con un mensaje claro, nunca a una página rota.
- Config: cliente OAuth en Google Cloud (Web), redirect URI de Supabase, proveedor Google activado en Supabase. Mientras no esté definida la cuenta de Google de producción (§7), se trabaja con un cliente de desarrollo.

**R3. Teléfono obligatorio antes de pagar**
- Si en `/comprar` el perfil no tiene `telefono`, se pide en la misma pantalla antes de generar la preferencia de MP (misma validación que el registro: 6 a 30 caracteres) y se guarda en `profiles`.
- No se puede crear la preferencia de MP sin teléfono: se valida también en la Server Action, no solo en la UI.

**R4. Usuario logueado no ve login/registro**
- Con sesión válida, `/login` y `/registro` (con o sin query) redirigen a `/dashboard`. `/recuperar` no cambia.

**R5. Inicio borroso para usuarios sin plan**
- La variante `ninguno` de `/dashboard` deja de mostrar la tarjeta vacía y muestra **el Inicio real** (las mismas secciones que `completo`), con:
  - Blur fuerte (que no se lea ningún texto) e `inert` + `aria-hidden` en el contenido de fondo: no se puede clickear, enfocar ni leer con lector de pantalla.
  - Una **tarjeta de desbloqueo** centrada y fija en el viewport: título ("Desbloqueá OG Circle"), precio vigente (`getPlan()`, Edge Config) y botón "Comprar acceso" → `/comprar`.
  - El fondo se puede scrollear; la tarjeta queda fija.
- **Regla de seguridad (no negociable):** "datos reales borrosos" quiere decir **contenido real no sensible** (títulos, descripciones, nombres de secciones, miniaturas). **Lo sensible nunca se manda al navegador** en la variante `ninguno`:
  - URLs de reproducción de videos (`embedUrl`): `null`.
  - Contactos de agentes y profesionales, datos SWIFT, depósitos y cualquier campo que hoy pasa por `resolverSecreto()`: siguen sin enviarse (ya están protegidos; no se puede romper).
  - Criterio de aceptación: en el HTML y el payload RSC de `/dashboard/ninguno`, buscar un `embedUrl`, un teléfono o un email de agente no devuelve nada.
- El blur es solo presentación; la protección real es que el dato no llega.

**R6. Calculadora borrosa para usuarios sin plan**
- `/calculadora` sin plan deja de redirigir a `/comprar`: muestra la calculadora real borrosa e `inert`, con la misma tarjeta de desbloqueo.
- Los endpoints `/api/cotizador/*` siguen exigiendo plan (`requierePlan()`, 403) y eso no cambia.

**R7. Perfil y navegación normales sin plan**
- Sin plan, el menú (drawer) funciona y `/perfil` se ve completo con los datos propios del usuario.

**R8. Desbloqueo tras la compra**
- El flujo actual (`/comprar` → MP → `/comprar/pendiente` → `refreshSession()` → `/dashboard`) termina en el Inicio sin blur, también para usuarios de Google.

**R9. Origen del registro**
- Si el usuario llega con `?origen=<id>` a `/registro` o `/login`, el valor se guarda en una cookie first-party (30 días; first-touch: no se pisa si ya existe).
- Al crearse el perfil (email o Google), se escribe `profiles.origen_registro` si está vacío. Sin cookie queda `directo`.
- Solo se aceptan valores de una lista cerrada (los de R1 + `directo`); cualquier otro se guarda como `otro`. No se guarda texto libre del usuario.
- El panel `/admin/usuarios` muestra la columna "Origen" y permite filtrar por origen.

### P1 — Mejora clara, el núcleo funciona sin esto

- **P1-1.** Contador simple en `/admin` (o en `/admin/usuarios`): registros por origen y cuántos de cada origen compraron.
- **P1-2.** El Inicio borroso con estados de carga (skeleton) iguales a los de la variante completa, para que no "salte".

### P2 — A futuro (se diseña sin bloquearlo)

- Pasar `origen` también a la metadata de la preferencia de MP, para atribuir ventas y no solo registros.
- Unificar el texto legal y el precio de la landing con la plataforma (cuando se actualice Precios).

## 6. Métricas de éxito

| Métrica | Cómo se mide | Meta (30 días) |
|---|---|---|
| Registros que vienen de la landing | `profiles.origen_registro like 'landing-%'` | > 70% de los registros nuevos |
| Registros con Google | `auth.identities` con `provider = 'google'` | > 50% de los registros nuevos |
| Conversión registro → compra | perfiles con pago aprobado / registros, por origen | Línea de base en la semana 1, después se compara |
| Errores de OAuth | Sentry, eventos en el callback de Google | 0 errores no manejados |
| Fuga de datos sensibles | Test e2e que busca `embedUrl`/contactos en `/dashboard/ninguno` | 0, siempre (rompe el CI) |

## 7. Preguntas abiertas

| # | Pregunta | Quién | ¿Bloquea? |
|---|---|---|---|
| 1 | ¿Desde qué cuenta de Google se crea el proyecto OAuth de producción (Máximo o la empresa)? Define el nombre, logo y email de la pantalla de consentimiento. | Negocio | Bloquea **solo** el paso a producción; el desarrollo sigue con un cliente de prueba. |
| 2 | Para publicar la app OAuth hay que verificar `ogcircle.com.ar` en Google Search Console (TXT en DonWeb). ¿Quién tiene acceso a DonWeb? | Negocio | Bloquea solo producción. |
| 3 | El texto exacto de la tarjeta de desbloqueo (título y bajada). | Diseño / negocio | No: se arranca con "Desbloqueá OG Circle" y después se ajusta. |

## 8. Plan y dependencias

- **Contrato primero:** migración `profiles.origen_registro`, tipos regenerados, lista de orígenes, helpers con su firma final y la tarjeta de desbloqueo con sus props finales. Después los tickets van en paralelo.
- Repos separados: R1 (landing) no depende de nada del sistema más que de la URL; se puede mergear en cualquier momento, idealmente cuando R2 y R5 estén en producción.
- El paso a producción de Google depende de las preguntas 1 y 2.
- Checklist del CLAUDE.md: `/design-critique` sobre Inicio y Calculadora borrosos, `/design-system` si se crea un componente compartido (la tarjeta), `/simplify` antes de cada PR, y revisar `docs/RENDIMIENTO.md`, porque `/dashboard/ninguno` tiene que seguir siendo estática.

## 9. Tickets (Plane, 2026-10-04)

- **VGRP-76** — Acceso desde la landing: Google + origen del registro (R1, R2, R4, R9).
- **VGRP-77** — Plataforma borrosa sin plan: Inicio y Calculadora (R5, R6, R7). Incluye cerrar el acceso directo a `/dashboard/completo` sin plan.
- **VGRP-78** — Teléfono en `/comprar` + Google OAuth en producción + prueba de punta a punta (R3, R8). Bloqueado por VGRP-76.
