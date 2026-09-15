# Tasks: VGRP-40 — Panel admin: precios y flags de fase

**Status:** Implementado y verificado en browser real; pendiente sólo el token de Vercel (para escribir de verdad) y abrir el PR
**Last updated:** 2026-09-15
**Design:** [design-vgrp40.md](./design-vgrp40.md)

Ordered por dependencia. Los tests van junto a la tarea que verifican, no al final.

- [x] **40-T1 — `lib/config/write.ts::escribirEdgeConfig()`**
  Satisfies: US-6
  Notes: módulo nuevo, `import "server-only"`. `PATCH` a
  `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items` (+ `?teamId=` si aplica,
  confirmar al generar el token — ver 40-T7), header `Authorization: Bearer
  ${VERCEL_EDGE_CONFIG_WRITE_TOKEN}`, body `{ items: [{ operation: "update", key, value }] }`.
  Nunca propaga excepción cruda — devuelve `EdgeConfigWriteResult` (design.md
  §Interfaces). `lib/config/write.test.ts`: éxito (200, mock de `fetch`), error HTTP
  (4xx/5xx), error de red (fetch rechaza) — los tres devuelven `{ ok: false, ... }` sin
  tirar.

- [x] **40-T2 — `app/api/admin/config/route.ts` — `GET`**
  Satisfies: US-1, US-7
  Depends on: (ninguna — reusa `getConfig()` existente)
  Notes: `requireAdmin()` primero. Devuelve `{ precios, flags }` (sin `links`).
  `dynamic = "force-dynamic"` (mismo criterio que el resto de `/api/admin/*`). Tras el
  pase de `/simplify`: usa `Promise.all([getPrecios(), getFlags()])` en vez de
  `getConfig()` completo, para no traer `links` sin usarlo.
  `route.test.ts`: sin sesión → 401; rol `user` → 404 sin llamar a `getPrecios`/`getFlags`;
  rol admin → 200 con la forma esperada.

- [x] **40-T3 — `app/api/admin/config/route.ts` — `PATCH`**
  Satisfies: US-2, US-3, US-5, US-6, US-7
  Depends on: 40-T1
  Notes: `patchBodySchema` (design.md §Interfaces, `z.union` de `{ precios }` o
  `{ flags }` completos). `requireAdmin()` ANTES de leer `getConfig()`/llamar a
  `escribirEdgeConfig()` (mismo orden que el resto del panel — el test tiene que
  confirmar "con rol user, cero llamadas a Edge Config", no sólo el status). Éxito →
  `conAuditoria()` con `entidad: "config"`, `entidadId: "precios" | "flags"`. Fallo de
  `escribirEdgeConfig()` → `502`, mensaje genérico, `Sentry.captureException` con el
  detalle real, **cero fila de audit log** (aserto explícito en el test, no sólo el
  status). `route.test.ts` (mock de `lib/config/write.ts` completo, patrón de
  `webhook-mercadopago.test.ts` para mockear una API externa):
  - Sin sesión → 401. Rol `user` → 404, cero llamadas a `escribirEdgeConfig`.
  - Body con `precios.avanzado: 0` / `-5000` / `"abc"` / ausente → 400, `fieldErrors`,
    cero llamadas a `escribirEdgeConfig`.
  - Body con `flags.fase: "5"` (fuera del enum) → 400.
  - Éxito con `precios` → 200, fila de audit log con `valorAnterior`/`valorNuevo`
    correctos, `entidadId: "precios"`.
  - Éxito con `flags` → 200, `entidadId: "flags"`.
  - `escribirEdgeConfig()` mockeado para fallar → 502, mensaje genérico (no el mensaje
    crudo del mock), Sentry llamado, **admin_audit_log sin fila nueva** (confirmado
    contra la base real, no sólo "no se llamó a `conAuditoria`" — mismo rigor que
    VGRP-49 aplicó a la rama fea de auditoría).

- [x] **40-T4 — `app/admin/config/page.tsx`**
  Satisfies: US-1, US-7
  Depends on: 40-T2 (comparte el mismo `getConfig()`, no depende literalmente del route
  handler)
  Notes: Server Component, `requireAdminPage()` ya lo cubre el layout de `app/admin/`
  (no hace falta repetirlo, mismo patrón que `usuarios/page.tsx`). Llama `getConfig()`
  directo (no hace un `fetch` a su propio `GET`, igual que el resto de las páginas de
  admin). Si `precios.ok === false`, muestra el aviso explícito de US-1 en vez de un
  campo editable con un valor inventado. Renderiza `<PreciosForm>` y `<FlagsForm>`
  (client) pasándoles los valores iniciales.

- [x] **40-T5 — `PreciosForm.tsx` (client, confirmación inline)**
  Satisfies: US-2, US-4
  Depends on: 40-T3, 40-T4
  Notes: mismo esqueleto que `CambiarNivelForm.tsx` (fetch + `useTransition` +
  `router.refresh()`). Dos inputs numéricos (`principiante`, `avanzado`) con validación
  client-side espejo de `configSchema.shape.precios` (entero positivo) —
  deshabilita el submit si algo no valida, no depende sólo del 400 del servidor.
  Al enviar: NO hace el `fetch` todavía — pasa a un estado de revisión inline
  ("`avanzado`: 125000 → 130000 — ¿Confirmar?") con botones "Confirmar" / "Cancelar".
  "Cancelar" vuelve al form sin tocar nada (US-4: "no escribir ningún cambio"). Sólo
  "Confirmar" dispara el `PATCH { precios: { principiante, avanzado } }` real. Maneja
  `400` (fieldErrors) y `502` (mensaje genérico) con `FormError`, igual que
  `ReprocesarButton`.

- [x] **40-T6 — `FlagsForm.tsx` (client, sin confirmación)**
  Satisfies: US-3
  Depends on: 40-T3, 40-T4
  Notes: dos checkboxes (`checkout_habilitado`, `registro_habilitado` — reusar
  `components/ui/Checkbox.tsx`) + un `<select>` nativo para `fase` (mismo patrón que el
  `<select>` de nivel en `CambiarNivelForm`). Submit directo, sin paso de confirmación
  (US-3 no lo pide). Mismo manejo de error que 40-T5 (sin el paso de revisión).

- [ ] **40-T7 — Infraestructura: token de escritura + env var**
  Satisfies: (constraint de design.md, bloquea la verificación real de 40-T1/T3)
  Notes: **Parcial.** Agregado a `.env.example`: `VERCEL_EDGE_CONFIG_ID` (no es secreto,
  hardcodeado al valor real conocido de `docs/EDGE-CONFIG.md`), `VERCEL_EDGE_CONFIG_WRITE_TOKEN`
  (vacío) y `VERCEL_TEAM_ID` (vacío, opcional). **Falta generar el token real** en
  Account/Team Settings → Tokens del dashboard de Vercel y cargarlo en `.env.local` (y como
  secret de despliegue) — acción manual fuera del alcance de lo que se puede hacer desde
  el código. No bloqueó 40-T1 a 40-T6 (implementados y testeados con `fetch` mockeado) —
  sí bloquea la verificación manual real de 40-T9.

- [x] **40-T8 — Nav del panel + `docs/EDGE-CONFIG.md`**
  Satisfies: (cierre del panel — ver requirements.md Summary)
  Depends on: 40-T4
  Notes: `{ href: "/admin/config", label: "Config" }` agregado a `NAV` en
  `app/admin/layout.tsx`. `docs/EDGE-CONFIG.md` actualizado: `precios`/`flags` ahora se
  editan desde `/admin/config` (recomendado), `links` sigue siendo sólo CLI (fuera de
  alcance de este ticket), la CLI queda documentada como alternativa para los tres.

- [x] **40-T9 — Verificación real**
  Depends on: todas las anteriores
  Notes:
  - `pnpm typecheck` ✅, `pnpm biome check .` ✅ (sólo en los archivos de este ticket —
    hay un archivo de otra sesión concurrente en el repo con un formato pendiente, no
    tocado a propósito), `pnpm build` ✅ (`/admin/config` y `/api/admin/config` → `ƒ`
    dinámico; `/dashboard/[variante]` sigue `●` estático, sin romper nada del bloque 7).
  - `pnpm test`: **27/27 tests nuevos en verde** (`lib/config/write.test.ts` ×6,
    `app/api/admin/config/route.test.ts` ×16, `lib/config/index.test.ts` ×5 sin
    regresiones), y la suite completa del repo sin contar los 8 fallos preexistentes de
    `webhook-mercadopago.test.ts` por falta de `MERCADOPAGO_WEBHOOK_SECRET` en este
    entorno (no relacionado a este ticket).
    - Hallazgo real en el camino: un bug en el PROPIO `write.test.ts` (no en `write.ts`)
      — el `afterEach` reasignaba `process.env` entero a un objeto plano, rompiendo la
      stringificación de `undefined` que Node aplica sobre el objeto especial real,
      y ocultaba el guard de "falta `VERCEL_EDGE_CONFIG_ID`" en el primer test del
      archivo. Corregido con `delete` explícito de las claves en vez de reemplazar
      `process.env`.
    - Hallazgo de infraestructura de test: la suite completa recogía también los
      worktrees de agentes anteriores bajo `.claude/worktrees/` (duplicando ~500 tests
      y fallando por falta de `node_modules`/env). Corregido agregando `.claude/**` (y
      `**/node_modules/**` en vez de sólo `node_modules/**`) al `exclude` de
      `vitest.config.ts` — beneficia a toda la suite, no sólo a este ticket.
  - `/simplify` (4 agentes en paralelo: reuse, simplificación, eficiencia, altitud) —
    aplicado: `Precios`/`Flags` como alias de `Config[...]` en vez de interfaces
    duplicadas, `FASES` exportado una sola vez desde `lib/config/schema.ts`,
    `useAdminMutation` extraído para no reimplementar el esqueleto fetch/estado una
    tercera y cuarta vez, validación de precio contra el mismo schema Zod del servidor
    (no una regla hardcodeada aparte), formateador de moneda ARS reusado de
    `comprar/page.tsx` (hoisted a `lib/format.ts`), y `page.tsx`/`GET`/`PATCH` ya no
    traen `links` ni la clave que no cambia desde `getConfig()`.
  - **`/design-critique` — verificación manual completa en browser real**, logueado
    como `admin@test.og-circle.invalid` (seed fijo de `test/helpers/seed-users.ts`):
    - Sin sesión: `/admin/config` → redirige a `/login` (fail-closed confirmado).
    - Como admin: cambiar un precio → paso de confirmación con "Avanzado: $ 125.000 →
      $ 130.000" (formateado en ARS) → al confirmar, sin el token de Vercel configurado
      (40-T7 pendiente), la API responde `502` y el form muestra "No se pudo guardar en
      Edge Config. Reintentá." sin filtrar detalle — la confirmación queda visible para
      reintentar, y el precio real en Edge Config no se tocó (confirmado recargando:
      seguía en 125.000). Mismo resultado con `FlagsForm` (`Guardar flags` sin paso de
      confirmación, mismo error 502 manejado igual).
    - Mobile (375×812): ambos formularios sin overflow horizontal, botones y checkboxes
      legibles.
    - Hallazgo real de la revisión: el botón "Confirmar" quedaba habilitado aunque
      `cambios.length === 0` (sin ningún precio distinto al actual), disparando un PATCH
      inútil. Corregido con `disabled={cambios.length === 0}` — confirmado visualmente
      que ahora queda deshabilitado con el mensaje "No hay cambios respecto al valor
      actual."
    - Confirmado que el mix `TextField` (precios) + `selectNativo`/`Checkbox` (flags) no
      es una inconsistencia nueva: `UsuariosFiltros.tsx` ya mezcla `TextField` con
      `selectNativo` en el mismo form — es el patrón establecido del panel, no algo a
      corregir.
    - `pnpm test:cleanup` corrido al final: 0 residuos (no se creó ningún usuario/dato
      ad hoc, sólo se usó el admin fijo del seed).
  - **Sigue pendiente, bloqueado por 40-T7**: la escritura real a Edge Config (que el
    cambio se refleje de verdad en `getConfig()` y quede la fila en
    `/admin/auditoria`) — sólo se pudo verificar el camino de éxito por tipos/tests
    (route.test.ts) y el camino de error por browser real; falta el token para el
    último tramo end-to-end.
