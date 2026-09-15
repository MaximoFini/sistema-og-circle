# Requirements: VGRP-40 — Panel admin: precios y flags de fase

**Status:** Approved
**Last updated:** 2026-09-15

## Summary

Pantalla y endpoint de admin (`/admin/config`) que le permiten a Jota cambiar los precios
de los dos niveles y los flags de fase (`checkout_habilitado`, `registro_habilitado`,
`fase`) sin pedirle nada al programador. Cierra el panel de administración completo
(VGRP-35/36/37/38 ya construidos): es la única pieza de configuración de negocio que
hoy sólo se puede cambiar editando Edge Config a mano por CLI (`vercel global-config
update`, documentado en `docs/EDGE-CONFIG.md`).

## Goals

- Que Jota pueda cambiar un precio o un flag desde una pantalla, sin tocar la CLI de
  Vercel ni pedirle nada a un programador, y que el cambio se refleje en el resto del
  sistema (checkout, flags de registro/checkout) sin deploy — mismo contrato que ya
  cumple la lectura (`lib/config/`).
- Que ningún precio inválido (cero, negativo, no numérico, vacío) pueda llegar a
  guardarse en Edge Config.
- Que todo cambio de precio o flag quede en el audit log existente
  (`admin_audit_log` vía `conAuditoria()`), con el valor anterior y el nuevo, igual que
  el resto de las mutaciones del panel (VGRP-36/37/38).
- Que un error de la API de Vercel al escribir no deje la configuración a medias — la
  escritura de Edge Config es atómica por store (confirmado abajo en Constraints), así
  que esto se resuelve por diseño de la API, no por lógica propia.
- Cerrar el panel: después de este ticket, ninguna pieza de configuración de negocio
  documentada en `docs/EDGE-CONFIG.md` depende de la CLI para cambiarse.

## Non-goals

- **Cualquier control de descuento o porcentaje promocional.** `configSchema` (§comentario
  de cabecera) y `docs/EDGE-CONFIG.md` ya prohíben explícitamente agregar claves de
  early-adopter o descuento sin una decisión de proyecto registrada aparte. Este ticket no
  la toma.
- **Gestión de `links`** (`calculadora`, `whatsapp`, `traxcargo`). El ticket original
  (VGRP-40) sólo pide precios y flags; los links no tienen el mismo perfil de riesgo
  (no son dinero) y hoy sólo cambian por CLI ocasionalmente. Se puede agregar después
  como extensión menor de la misma pantalla si el equipo lo pide — no bloquea este ticket.
- **Historial de cambios de config como pantalla dedicada.** El audit log genérico
  (`/admin/auditoria`, ya existe) ya lista estas mutaciones por `entidad`/`accion`; no se
  construye una vista de "historial de precios" aparte.
- **Cambiar el schema de configuración** (agregar niveles, agregar fases, etc.) — fuera de
  alcance, es una decisión de producto aparte.
- **Aplicar el cambio a pagos ya realizados.** El ledger de pagos guarda el monto real
  cobrado en el momento (`pagos.monto` o campo equivalente); cambiar `precios` en Edge
  Config nunca reescribe ni recalcula un pago histórico.
- **Rollback automático / versionado de config.** Si un admin necesita revertir un cambio,
  lo hace manualmente desde la misma pantalla (ver el valor anterior en el audit log y
  volver a escribirlo) — no se construye un botón de "revertir".

## User stories

### US-1: Ver la configuración actual de precios y flags

Como admin, quiero ver los precios vigentes de cada nivel y el estado de los flags de
fase al entrar a `/admin/config`, para saber qué voy a cambiar antes de tocar nada.

**Acceptance criteria:**

- WHEN un admin abre `/admin/config` THE SYSTEM SHALL mostrar los precios actuales de
  `principiante` y `avanzado`, y el estado actual de `checkout_habilitado`,
  `registro_habilitado` y `fase`.
- THE SYSTEM SHALL leer estos valores en el servidor (Server Component), usando
  `lib/config/getConfig()` existente — no una lectura directa de Edge Config duplicada.
- IF la lectura de `precios` falla (mismo caso que `getPrecios()` ya maneja con
  `{ ok: false, error }`) THEN THE SYSTEM SHALL mostrar un aviso explícito de que los
  precios no se pudieron leer, en vez de mostrar un campo vacío o en cero editable.
- IF la lectura de `flags` falla THEN THE SYSTEM SHALL mostrar los valores por defecto
  conservadores que ya devuelve `getFlags()`, dejando claro en la UI que son el fallback
  y no el valor confirmado de Edge Config.

### US-2: Editar precios con validación fuerte

Como admin, quiero cambiar el precio de un nivel y que el sistema no me deje guardar un
valor inválido, para no romper el checkout por un error de tipeo.

**Acceptance criteria:**

- WHEN un admin envía un nuevo precio para `principiante` o `avanzado` THE SYSTEM SHALL
  validarlo como entero positivo (mismo criterio que `configSchema.shape.precios`) antes
  de escribir nada.
- IF el precio enviado es cero, negativo, no numérico o está vacío THEN THE SYSTEM SHALL
  rechazar la request con `400` (o el equivalente de validación en el form) y no escribir
  en Edge Config.
- IF el precio enviado no es un entero (por ejemplo `75000.50`) THEN THE SYSTEM SHALL
  rechazarlo con el mismo criterio (el schema exige entero).
- WHEN la validación pasa y el admin confirma THE SYSTEM SHALL escribir el nuevo valor en
  la clave `precios` de Edge Config, dejando el valor de "moneda" (ARS) implícito, igual
  que hoy.

### US-3: Editar flags de fase

Como admin, quiero prender o apagar `checkout_habilitado` y `registro_habilitado`, y
cambiar la `fase` actual, para controlar qué partes del sistema están activas sin pedir
un deploy.

**Acceptance criteria:**

- WHEN un admin cambia `checkout_habilitado` o `registro_habilitado` THE SYSTEM SHALL
  aceptar solo `true`/`false` (checkbox o toggle, no texto libre).
- WHEN un admin cambia `fase` THE SYSTEM SHALL restringir la selección al enum existente
  (`"1" | "2" | "3" | "4"`), sin permitir un valor fuera de ese conjunto.
- WHEN la validación pasa y el admin confirma THE SYSTEM SHALL escribir los nuevos flags
  en la clave `flags` de Edge Config.

### US-4: Confirmación explícita antes de guardar un cambio de precio

Como admin, quiero ver un paso de confirmación con el valor anterior y el nuevo antes de
que un cambio de precio se aplique, para no tocar el precio real por error.

**Acceptance criteria:**

- WHEN un admin envía un formulario que cambia al menos un precio THE SYSTEM SHALL
  mostrar un paso de confirmación explícito (modal o pantalla intermedia) con el valor
  anterior y el valor nuevo de cada precio modificado, antes de escribir en Edge Config.
- IF el admin cancela la confirmación THEN THE SYSTEM SHALL NOT escribir ningún cambio.
- WHEN el admin confirma THE SYSTEM SHALL proceder a validar (US-2) y escribir.
- THE SYSTEM SHALL NOT exigir el mismo paso de confirmación para cambios que sólo tocan
  flags (no son dinero) — el criterio de aceptación del ticket original pide
  confirmación específicamente para precios.

### US-5: Auditoría de cada cambio

Como responsable del sistema, quiero que cada cambio de precio o flag quede registrado
con quién lo hizo y qué valor tenía antes, para poder reconstruir la historia de la
configuración de negocio.

**Acceptance criteria:**

- WHEN un cambio de `precios` o `flags` se escribe con éxito en Edge Config THE SYSTEM
  SHALL escribir una fila en `admin_audit_log` (vía `conAuditoria()`, el único helper de
  escritura del panel) con `actor_id` (el admin), `accion` (p. ej. `actualizar_config`),
  `entidad` (`config`), `valor_anterior` y `valor_nuevo` conteniendo exactamente las
  claves que cambiaron.
- IF la escritura a Edge Config falla THEN THE SYSTEM SHALL NOT escribir una fila de
  audit log para ese intento (mismo criterio que el resto del panel: no se auditan
  mutaciones fallidas).
- THE SYSTEM SHALL usar un `entidad_id` estable para las filas de configuración (Edge
  Config no tiene un UUID de fila) — a definir en diseño (p. ej. la clave modificada,
  `"precios"` o `"flags"`).

### US-6: Manejo de errores de la API de Edge Config

Como admin, quiero que un error al escribir en Edge Config me lo diga claramente y no
deje el sistema en un estado ambiguo, para saber si tengo que reintentar o avisar.

**Acceptance criteria:**

- IF la API de Vercel Edge Config devuelve un error al escribir (red, 4xx, 5xx, token
  inválido) THEN THE SYSTEM SHALL mostrar un mensaje de error claro al admin y THE SYSTEM
  SHALL NOT asumir que el cambio se aplicó.
- THE SYSTEM SHALL NOT escribir una fila de audit log cuando la escritura falla (ver
  US-5).
- WHEN el admin reintenta después de un error THE SYSTEM SHALL permitir reenviar el mismo
  cambio sin recargar la página ni perder lo que había tipeado.
- THE SYSTEM SHALL NOT filtrar el detalle crudo de la respuesta de error de la API de
  Vercel (headers, token) en la UI ni en logs accesibles al cliente — mismo criterio que
  el resto del repo (`Sentry.captureException` en servidor, mensaje genérico al cliente).

### US-7: Acceso restringido a admin

Como admin del equipo, quiero que sólo alguien con rol admin pueda ver o cambiar la
configuración de precios y flags, para que nadie más pueda alterar cuánto cobra el
sistema.

**Acceptance criteria:**

- WHEN un request llega a `/admin/config` (página) o a su endpoint bajo `/api/admin/config`
  THE SYSTEM SHALL aplicar el mismo guard que el resto del panel
  (`requireAdminPage()` / `requireAdmin()`, `lib/auth/admin.ts`) — sin sesión redirige o
  responde `401`; con sesión pero `rol != 'admin'` responde `404` (nunca `403`).
- THE SYSTEM SHALL NOT exponer el token de la API de Edge Config (ni ningún secreto de
  escritura) al cliente en ningún momento — sólo se usa dentro del Route Handler, en
  servidor.

## Constraints

- **Stack fijo:** Next.js 15 App Router (React 19, TS strict), CSS Modules con los tokens
  de `DESIGN.md`, Zod para validación de entrada, sin librerías nuevas fuera de
  `STACK.md`.
- **Mapeo de rutas del repo (el ticket dice `/admin/config`, la convención real del repo
  separa página de API):** página en `app/admin/config/page.tsx` (Server Component +
  form client), endpoint en `app/api/admin/config/route.ts` (`GET` para leer,
  `PATCH` para escribir) — mismo patrón que `app/api/admin/usuarios/[id]/nivel/route.ts`.
- **Lectura reutiliza `lib/config/getConfig()`** (`lib/config/index.ts`) — no se duplica
  la lógica de fail-open/fail-closed ya implementada y documentada ahí y en
  `docs/EDGE-CONFIG.md`.
- **Escritura es infraestructura nueva.** `lib/config/index.ts` sólo lee (paquete
  `@vercel/edge-config`, que es read-only). Escribir requiere la API REST de Vercel
  (`PATCH https://api.vercel.com/v1/edge-config/{edgeConfigId}/items`), que necesita:
  - Un **token de API de Vercel** con permiso de escritura sobre el store — no existe hoy
    en el repo (`.env.example` sólo tiene `EDGE_CONFIG`, la connection string de lectura).
    Se agrega como secreto de servidor nuevo (nombre a definir en diseño, p. ej.
    `VERCEL_EDGE_CONFIG_WRITE_TOKEN`), nunca en el cliente.
  - El **Edge Config ID** (`ecfg_5zkcaib5hisdopluzptaqj81mmq4`, documentado en
    `docs/EDGE-CONFIG.md`) — puede ir hardcodeado (no es secreto, es un identificador) o
    como env var; a definir en diseño.
  - Posiblemente el **Team ID** de Vercel si el store vive bajo un team (a confirmar al
    generar el token).
- **La escritura a Edge Config es atómica por request de la API de Vercel** (un PATCH con
  varios `items` se aplica todo o nada) — esto es lo que sostiene US-6 "no deja la config
  a medias" sin necesitar lógica de rollback propia. A confirmar contra la documentación
  oficial de Vercel en la fase de diseño antes de asumirlo como garantía.
- **Reutilización obligatoria:** toda mutación pasa por `conAuditoria()`
  (`lib/data/admin/audit-log.ts`) — no se escribe `admin_audit_log` ad-hoc.
- **Gating por claim, no por query:** mismo criterio que el resto del panel
  (`requireAdmin()` / `requireAdminPage()`, `lib/auth/admin.ts`).
- **Sin descuentos:** el schema (`lib/config/schema.ts`) y `docs/EDGE-CONFIG.md` prohíben
  explícitamente agregar claves de descuento/early-adopter. Este ticket no lo hace ni
  habilita un campo "vacío" para agregarlo después sin decisión.
- **CI en verde:** typecheck + `biome ci` + la suite de Vitest/Playwright. La escritura a
  Edge Config real no se puede probar contra un store de test aislado (es el mismo store
  de producción, según `docs/EDGE-CONFIG.md`) — la estrategia de test se define en diseño
  (mock de la llamada HTTP a la API de Vercel, no golpear el store real desde los tests).
- **Entrega:** rama + PR, commits/push por Claude Code (hooks de review). `/simplify`
  antes de abrir el PR. `/design-critique` sobre la pantalla nueva (es UI nueva).
  `/design-system` si se reusan/crean primitivas compartidas de formulario.
- **Criterios de aceptación globales del PRD §6** aplican antes de cerrar el ticket.

## Open questions

- **Nombre exacto y alcance del token de escritura de Vercel.** Hay que generarlo desde
  el dashboard de Vercel (Account/Team Settings → Tokens) con el scope mínimo necesario
  para escribir en este Edge Config store. No bloquea Requirements/Design, pero sí
  bloquea probar la escritura real antes de tener el token en `.env.local` y como secret
  de despliegue.
- **`entidad_id` de las filas de audit log de config.** Edge Config no tiene un id de fila
  natural. Propuesta a confirmar en diseño: usar la clave modificada (`"precios"` o
  `"flags"`) como `entidad_id`, o un valor fijo como `"config"` con el detalle completo en
  `valor_anterior`/`valor_nuevo`.
- **¿Un solo formulario que guarda precios y flags juntos, o dos formularios
  independientes?** El ticket pide confirmación explícita sólo para precios; si van en el
  mismo submit, hay que decidir si cambiar sólo un flag también dispara el modal de
  confirmación (spec dice que no debería) — a resolver en diseño.
