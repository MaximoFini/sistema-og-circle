# Observabilidad — VGRP-41

Sentry (errores), Vercel Speed Insights (performance) y Vercel Analytics (eventos de
conversión), instrumentados en el código. Sigue el mismo criterio que
`docs/EDGE-CONFIG.md`: qué existe, qué falta, y qué tiene que hacer alguien con acceso
externo para que quede 100% operativo.

## Estado actual

El código está instrumentado y es **fail-open**: sin las env vars de Sentry, la app
arranca y funciona exactamente igual que hoy, sin romper nada ni loguear warnings en
cada request.

- `instrumentation.ts` (raíz) inicializa Sentry en runtime Node/Edge, sólo si
  `process.env.SENTRY_DSN` está seteada.
- `instrumentation-client.ts` (raíz) inicializa Sentry en el cliente (Client Components,
  ej. `PendienteClient.tsx`), sólo si `NEXT_PUBLIC_SENTRY_DSN` está seteada.
- `app/api/webhooks/mercadopago/route.ts`: `reportarFalloDeProcesamiento` (el fallo real,
  el que responde 500 y hace que MP reintente) llama a `Sentry.captureException(error, {
  extra: { detalle } })` con severidad alta. `reportarProblemaDeHook` y
  `reportarPagoSinCorrelacion` (casos ya manejados a conciencia, responden 200) mandan
  `Sentry.captureMessage(..., "warning")` — severidad baja, para no generar ruido.
- `app/layout.tsx` tiene `<SpeedInsights />` (`@vercel/speed-insights/next`) y
  `<Analytics />` (`@vercel/analytics/next`) en el body del root layout.
- Conversión por nivel (PRD: cuántos inician checkout vs. cuántos terminan pagando):
  - `app/(app)/comprar/_actions.ts` (`crearCheckout`) dispara `track("checkout_iniciado",
    { nivel })` al crear la preferencia exitosamente.
  - `app/api/webhooks/mercadopago/route.ts` dispara `track("pago_aprobado", { nivel:
    nivelComprado })` cuando `proyectarNivel` resuelve con éxito (`estadoInterno ===
    "approved"`).
  - Ambas llamadas están envueltas en try/catch que sólo loguea si fallan — nunca pueden
    tirar abajo el flujo principal (mismo criterio que `notificarPagoAprobado`).

**Nunca se activa `sendDefaultPii: true`** en ninguna inicialización de Sentry: este
proyecto maneja datos de pago (Mercado Pago) y tokens de sesión (Supabase Auth). Sentry
no debe recibir PII por default.

**Actualizado (VGRP-48)** — la cuenta de Sentry ya existe y `SENTRY_DSN`/
`NEXT_PUBLIC_SENTRY_DSN` ya están cargadas en `.env.local`. La sección "Lo que falta"
de abajo quedó obsoleta en ese punto — se conserva el resto (Alert Rule, source maps)
porque sigue vigente.

### `environment` — nunca inferido de `NODE_ENV` (bug real, corregido)

Encontrado corriendo el E2E de VGRP-48 contra un build de producción local: **con la
cuenta ya conectada, cualquier build o test corrido en una máquina local mandaba sus
errores a Sentry etiquetados `environment: production`** — indistinguible de un deploy
real — y disparaba la Alert Rule de verdad (email al equipo) por simplemente correr
`pnpm build && pnpm start` a mano o `pnpm test:e2e` (que fuerza `NODE_ENV=production`
para el server que levanta, ver `playwright.config.ts`). Causa: el SDK de Sentry, sin
`environment` explícito, lo infiere de `NODE_ENV`.

Fix en `instrumentation.ts`/`instrumentation-client.ts`: `environment` se arma a partir
de `VERCEL_ENV`/`NEXT_PUBLIC_VERCEL_ENV` (variables de sistema que Vercel expone solas
en cada deploy — `production` | `preview` | `development`, nunca presentes en una
máquina local), con fallback a `"local"`. Cualquier corrida fuera de un deploy real de
Vercel queda etiquetada `local`, así que una Alert Rule filtrada por
`environment = production` no vuelve a capturar ruido de desarrollo/tests.

## Lo que falta — bloqueante externo (no es código)

1. (Opcional, sólo para subir source maps en el build de CI/producción — no hace falta
   en desarrollo local) `SENTRY_AUTH_TOKEN`, generado en Organization Settings → Auth
   Tokens, con scope `project:releases`. Sin esta env var el build funciona igual, sólo
   que sin source maps legibles en los stack traces de Sentry.
2. Confirmar en **Vercel → Settings → Environment Variables** que `SENTRY_DSN` y
   `NEXT_PUBLIC_SENTRY_DSN` también estén cargadas ahí (production, preview y
   development) — hoy sólo están confirmadas en `.env.local`.

### Alert Rule — la alerta por email del fallo del webhook

Decisión del equipo: Sentry captura la excepción (ya está en el código,
`reportarFalloDeProcesamiento`) y **Sentry mismo dispara el email** — no es algo que el
código pueda hacer por sí solo. Una vez que exista el DSN real, alguien con acceso al
dashboard de Sentry tiene que crear una **Alert Rule**:

- Project: el proyecto de Sentry de este repo.
- Condición: "An event is seen" (o "A new issue is created") con filtro por el mensaje o
  el tag del evento — el `extra.detalle` que manda `reportarFalloDeProcesamiento` incluye
  el string `mercadopago-webhook`, sirve para armar el filtro.
- Acción: enviar email al canal/lista que decida el equipo.

Sin esta Alert Rule, Sentry va a seguir capturando la excepción igual (aparece en el
dashboard), pero nadie se entera por email hasta que alguien la mire manualmente.

## Hueco de auditoría del panel de admin — VGRP-35 (`admin-audit-gap`)

`lib/data/admin/audit-log.ts::conAuditoria()` envuelve toda mutación del panel
(cambio de nivel, reproceso de pago). El orden es: corre la mutación de negocio
primero, y **sólo si tuvo éxito** escribe la fila en `admin_audit_log`.

Si ese `insert` de auditoría falla **después** de una mutación exitosa:

- **NO se revierte la mutación.** Es imposible: `proyectarNivel` incluye una
  llamada a la Admin API de Auth (`updateUserById`), que no entra en una
  transacción de Postgres. El nivel/pago del usuario ya cambió.
- **NO se le devuelve error al admin.** La operación efectivamente se aplicó;
  responder "falló" sería mentir y llevaría a reintentos que duplican overrides.
- Se llama a `Sentry.captureException(error, { level: "error", tags: {
  "admin-audit-gap": "true" }, extra: { detalle, meta } })`.

**Es un incidente, no un error de request.** Un hueco en la auditoría significa
que una acción de admin ocurrió sin quedar registrada — hay que reconstruirla a
mano desde el `extra.meta` del evento de Sentry (trae `actorId`, `accion`,
`entidad`, `entidadId`). Fail-open igual que el resto: sin `SENTRY_DSN` la
llamada es un no-op y no rompe el flujo.

Cuando exista el DSN real, conviene una **Alert Rule** aparte para el tag
`admin-audit-gap` (severidad alta), separada de la del webhook de Mercado Pago.

## Pendiente — panel de admin (fuera de este batch)

La otra mitad de la decisión del equipo fue que "el admin también ve el error en
pantalla". El panel de admin (VGRP-35/36/37) **no existe todavía en este repo** — es un
ticket posterior. Este ticket (VGRP-41) no construye ningún panel.

Cuando el panel exista, tiene que poder leer los pagos cuyo `estado` no llegó a
proyectarse (ver PRD §3.8, flujo de recuperación ante webhook fallido) — es decir, filas
de la tabla `pagos` donde `insertarPago` escribió el registro pero `proyectarNivel`
falló después (el caso exacto que dispara el 500 y el `Sentry.captureException` de
arriba). Ese es el mecanismo de recuperación manual que el admin necesita: ver cuáles
pagos quedaron "a medio proyectar" y volver a correr la proyección a mano.

## Checklist pre-lanzamiento

- [ ] `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN` cargadas en Vercel (production).
- [ ] Alert Rule de Sentry creada para el webhook de Mercado Pago (ver arriba).
- [ ] **Verificar que la connection string de Supabase en producción usa el pooler en
      modo *transaction* (puerto `6543`), no la conexión directa (`5432`).** Esto es una
      verificación manual de configuración, no algo que el código pueda chequear en
      runtime: el modo *transaction* es el que soporta el volumen de conexiones
      concurrentes de serverless (cada invocación de una Route Handler/Server Action abre
      su propia conexión); la conexión directa se agota rápido bajo esa carga. Revisar en
      Supabase → Project Settings → Database → Connection string, y en la env var
      correspondiente en Vercel.
