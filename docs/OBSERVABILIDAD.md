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

## Lo que falta — bloqueante externo (no es código)

Igual que pasó con Mercado Pago y Vercel: no hay cuenta de Sentry real todavía. Alguien
del equipo con acceso tiene que:

1. Crear el proyecto en [sentry.io](https://sentry.io) (plataforma: Next.js).
2. Conseguir el DSN del proyecto (Project Settings → Client Keys (DSN)).
3. Cargar dos env vars en **Vercel → Settings → Environment Variables** (production,
   preview y development):
   - `SENTRY_DSN` — el mismo DSN, para la inicialización de servidor.
   - `NEXT_PUBLIC_SENTRY_DSN` — el mismo DSN, para la inicialización de cliente (viaja al
     bundle del browser a propósito, es el patrón estándar de Sentry — un DSN no es un
     secreto, sólo identifica a qué proyecto de Sentry mandar eventos).
4. (Opcional, sólo para subir source maps en el build de CI/producción — no hace falta
   en desarrollo local) `SENTRY_AUTH_TOKEN`, generado en Organization Settings → Auth
   Tokens, con scope `project:releases`. Sin esta env var el build funciona igual, sólo
   que sin source maps legibles en los stack traces de Sentry.
5. Bajar las mismas env vars a local con `vercel env pull .env.local` (mismo flujo que
   `EDGE_CONFIG`, ver `docs/EDGE-CONFIG.md`).

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
