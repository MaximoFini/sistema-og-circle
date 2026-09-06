# Tasks: Bloque 5 — Panel de administración base

**Status:** In progress
**Last updated:** 2026-09-05
**Design:** [design.md](./design.md)
**Requirements:** [requirements.md](./requirements.md)

La entrega es **una rama + un PR por ticket**, en orden **VGRP-35 → VGRP-36 → VGRP-37**.
Cada paquete de abajo es autocontenido y está pensado como el brief de un subagente que
arranca en frío. Dentro de cada paquete las tareas están ordenadas por dependencia: primero
migración + tipos, después capa de datos (`lib/data/admin/*`), después endpoints/páginas,
con los tests al lado de lo que verifican, y al final los pasos de cierre (`/simplify`,
`/design-critique`, PR). Marcá cada `- [ ]` a medida que se completa.

> **Nota transversal sobre migraciones (aplica a 35-T1, 36-T1, 37-T1):** las 3 migraciones
> se aplican con `apply_migration` del MCP de Supabase **y** se versionan como archivo en
> `supabase/migrations/` con el nombre exacto indicado. Si al arrancar el paquete el MCP de
> Supabase **no está autorizado** (o no apunta al proyecto `sa-east-1`), la tarea de
> migración cae a "escribir el archivo SQL revisado en `supabase/migrations/` **sin
> aplicar**" y avisar al coordinador — igual que en bloques previos. En ese caso las tareas
> que dependen de tipos regenerados quedan bloqueadas hasta que alguien con acceso aplique
> la migración.

---

## Paquete VGRP-35 — Panel admin: rol, protección de rutas y audit log

### Para el subagente que tome este paquete

- **Rama a crear:** `bloque-5/vgrp-35-panel-admin-base` (desde `main`).
- **Qué asume ya mergeado:** nada nuevo. Parte del `main` actual (Bloque 4 adentro).
- **Archivos que va a crear/modificar** (design.md §"Estructura de rutas y archivos" +
  §"Mapa de entrega por ticket"):
  - `middleware.ts` (modificar — sumar capa de rol, sin aflojar nada existente)
  - `middleware.test.ts` (modificar)
  - `lib/auth/admin.ts` (crear)
  - `app/admin/layout.tsx`, `app/admin/admin.module.css`, `app/admin/page.tsx`,
    `app/admin/not-found.tsx` (crear)
  - `app/admin/auditoria/page.tsx`, `app/admin/auditoria/AuditoriaFiltros.tsx` (crear)
  - `lib/data/admin/audit-log.ts`, `lib/data/admin/audit-log.test.ts` (crear)
  - `supabase/migrations/20260905030000_admin_audit_log_indices.sql` (crear)
  - `test/integration/rls.test.ts` (modificar — variante `withPolicyDisabled`)
  - `e2e/admin-acceso.spec.ts` (crear)
  - `docs/SUPABASE-SETUP.md`, `docs/OBSERVABILIDAD.md` (modificar)
- **Definition of done del paquete:**
  - `pnpm typecheck` + `pnpm biome ci` + `pnpm build` + `pnpm test` + `pnpm test:e2e` en verde.
  - Migración de índices aplicada por MCP y versionada; `get_advisors` corrido y sin
    advisors nuevos bloqueantes (o anotados si aparecen).
  - `/simplify` corrido sobre el código nuevo (limpieza de reuse/eficiencia; no reemplaza
    el code-review automático del commit).
  - `/design-critique` corrido sobre el shell (`layout`), el índice (`page.tsx`) y la
    pantalla de auditoría. `/design-system` **no** aplica salvo que se toquen primitivas de
    `components/ui` (el diseño recomienda `<select>`/`<textarea>` nativos locales — eso es
    VGRP-36, no acá).
  - PR abierta describiendo VGRP-35 (rol + protección de rutas + audit log). Commits y push
    por Claude Code (hooks de review/seguridad).

### Tareas

- [x] **35-T1 — Migración `20260905030000_admin_audit_log_indices.sql` (2 índices)**
  Satisfies: US-2
  ESTADO: **APLICADA por el coordinador el 2026-09-05** con `apply_migration`
  (MCP de Supabase, proyecto `og-circle` / `hsmodrhbwkromoixrxrt` / `sa-east-1`).
  Los 2 índices existen en la base (`admin_audit_log_created_at_idx`,
  `admin_audit_log_actor_created_idx`). Archivo versionado con header actualizado.
  `lib/database.types.ts` NO se tocó (un índice no cambia la forma de la tabla).
  Notes: Crear los 2 índices de design.md §"VGRP-35 — índices en `admin_audit_log`":
  `admin_audit_log_created_at_idx (created_at desc, id desc)` y
  `admin_audit_log_actor_created_idx (actor_id, created_at desc, id desc)` — sirven al orden
  desc y al filtro por actor + keyset de la pantalla de auditoría. **No** tocar ninguna
  policy ni grant existentes (`admin_audit_log_select_admin` queda igual). Aplicar por MCP y
  versionar (ver nota transversal de migraciones). Los índices no cambian el esquema de
  tipos → **no hace falta** regenerar `lib/database.types.ts` en este paquete.

- [x] **35-T2 — `get_advisors` tras aplicar la migración**
  Satisfies: US-2
  Depends on: 35-T1
  ESTADO: **CORRIDO por el coordinador el 2026-09-05** (security + performance).
  Sin hallazgos nuevos por la migración: los 2 índices nuevos figuran como
  `unused_index` (INFO, esperado — sin tráfico todavía); el único WARN de
  seguridad es `auth_leaked_password_protection`, pre-existente y ajeno (setting
  de Auth, no de esta migración).
  Notes: Correr `get_advisors` (security + performance) del MCP. Resolver o anotar en la PR
  cualquier hallazgo nuevo. Se espera cero cambios (sólo índices), pero es la verificación
  obligatoria por paquete (design.md §"Open questions / risks" #3).

- [x] **35-T3 — `lib/auth/admin.ts` con `requireAdmin()` y `requireAdminPage()`**
  Satisfies: US-1
  Notes: Implementar según design.md §"Interfaces / contracts" (bloque de código de
  `lib/auth/admin.ts`). `import "server-only"` arriba de todo. `requireAdmin()` para Route
  Handlers → devuelve `{ ok: true, actorId }` o `{ ok: false, response }` con `401` (sin
  sesión) o **`404`** (`rol != 'admin'` o `sub` vacío) — **nunca `403`**. `requireAdminPage()`
  para Server Components/layout → `redirect('/login?next=/admin')` sin sesión, `notFound()`
  si no es admin. Ambos leen el claim con `getVerifiedClaims()` (`lib/auth/server.ts`) +
  `getRol()` (`lib/auth/claims.ts`) — **cero queries**, nunca `getUser()`.

- [x] **35-T4 — Diff de `middleware.ts`: capa de rol para `/admin` y `/api/admin`**
  Satisfies: US-1
  Depends on: 35-T3
  Notes: Aplicar el diff conceptual de design.md §"Diff conceptual de `middleware.ts`":
  `ADMIN_PREFIXES = ["/admin", "/api/admin"]`, helper `isAdminArea()` (match exacto o
  `startsWith(\`${p}/\`)`). El check va **después** del bloque `if (!haySesion)` (o sea:
  sólo cuando ya hay sesión) y **antes** del `return response` final. Si `getRol(claims) !==
  "admin"`: `/api/...` → `NextResponse.json({ error: "No encontrado." }, { status: 404 })`;
  páginas → `new NextResponse("Not Found", { status: 404 })`. Envolver ambas con
  `withRefreshedCookies(...)`. No aflojar nada del fail-closed existente. Se puede probar
  `NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 })` para unificar
  el body; si resulta frágil en Next 15.5.x, queda el 404 pelado (aceptable por AC — el
  layout da el 404 lindo en el camino normal).

- [x] **35-T5 — Actualizar `middleware.test.ts` con los casos de rol admin**
  Satisfies: US-1
  Depends on: 35-T4
  Notes: Extender el archivo existente (mockea `@supabase/ssr` → `auth.getClaims`). Casos
  de design.md §"VGRP-35 → `middleware.test.ts`": sesión + `rol='user'` → `GET /admin` da
  `404` (no 307, no 200); sesión + `rol='user'` → `GET /api/admin/x` → `404` JSON; sesión +
  `rol='admin'` → `/admin` y `/api/admin/x` pasan; sin sesión → `/admin` → `307
  /login?next=/admin`, `/api/admin/x` → `401`; una ruta `/admin/inventada` (no existe en el
  árbol) para un no-admin **igual** da `404` (fail-closed: alcanza el prefijo).

- [x] **35-T6 — `lib/data/admin/audit-log.ts`: `registrarAccionAdmin`, `conAuditoria`, `listarAuditLog`**
  Satisfies: US-2
  Depends on: 35-T1
  Notes: `import "server-only"`. Cliente Supabase **inyectado como parámetro** (mismo patrón
  que `lib/data/pagos.ts`), no creado adentro. Contratos exactos en design.md §"Interfaces /
  contracts → `lib/data/admin/audit-log.ts`":
  - `registrarAccionAdmin(admin, e: EntradaAudit): Promise<void>` — inserta la fila
    (`actor_id`, `accion`, `entidad`, `entidad_id`, `valor_anterior`, `valor_nuevo`);
    propaga (throw) cualquier error de Postgres, sin interpretación de negocio.
  - `conAuditoria<T>(admin, meta, mutacion)` — corre `mutacion()`; si **tira**, propaga y
    **NO** escribe audit log (US-2: no se auditan intentos fallidos). Si tiene éxito,
    escribe la fila con el `valorAnterior`/`valorNuevo` que devolvió la mutación y retorna
    `resultado`. **Si el insert de auditoría falla *después* de una mutación exitosa:** NO
    revertir (imposible — `proyectarNivel` llama a la Admin API de Auth, fuera de transacción
    PG), NO devolver error al admin; `Sentry.captureException(e, { tags: { … } })` con tag
    `admin-audit-gap` y severidad alta.
  - `listarAuditLog(admin, filtros)` — Zod: `{ actorId: z.uuid().optional(), desde:
    z.iso.datetime().optional(), hasta: z.iso.datetime().optional(), limit:
    z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().optional() }`.
    Orden `created_at desc, id desc`; paginación **keyset** (cursor = base64 de `{ createdAt,
    id }`), **nunca offset**. Join opcional a `profiles` para el email del actor. Cursor mal
    formado → se ignora / se rechaza desde la página; nunca 500.

- [x] **35-T7 — `lib/data/admin/audit-log.test.ts` (integración)**
  Satisfies: US-2
  Depends on: 35-T6
  Notes: Casos de design.md §"Plan de tests → VGRP-35 → `audit-log.test.ts`": (1)
  `registrarAccionAdmin` inserta una fila con todos los campos y tipos correctos; (2)
  `conAuditoria` con `mutacion` OK → escribe la fila y devuelve el resultado; (3)
  `conAuditoria` con `mutacion` que lanza → **no** escribe fila, propaga el error; (4)
  `listarAuditLog` → filtro por `actorId`, por rango de fechas, y keyset (dos páginas
  disjuntas, no trae todo). Usar `createTestAdminClient()` y el usuario admin del seed
  (`SEED_ADMIN_USER`, ver `test/helpers/seed-users.ts` — **no hace falta tocar el seed**).
  Nombre del archivo consistente con `docs/TESTING.md`.

- [x] **35-T8 — Shell del área admin: `layout.tsx` + `admin.module.css` + `page.tsx` + `not-found.tsx`**
  Satisfies: US-1
  Depends on: 35-T3
  Notes: `app/admin/` es **carpeta literal** (no route group), hermana de `(app)`. Su
  `layout.tsx` es **dinámico a propósito** (excepción explícita a "el layout no lee
  cookies"): llama `requireAdminPage()` y envuelve todo el subárbol → ningún hijo renderiza
  para un no-admin ("nunca pantalla parcial"). No hereda `app/(app)/layout.tsx` — sólo
  `app/layout.tsx`. Shell: barra "Panel · OG Circle", nav (Usuarios / Pagos / Auditoría),
  link de logout, indicador "modo admin" atenuado, **sin** el footer legal de `(app)`.
  Primitivas reutilizadas: `TextLink`, `Button` de `components/ui`. `page.tsx` (índice): 3
  cards a las secciones. **El callout de `totalSinAplicar` depende de la vista
  `admin_pagos_ledger` (VGRP-37); en este paquete el índice se entrega con los 3 cards y
  SIN ese callout** — lo agrega 37-T11. `not-found.tsx`: 404 del área, tematizado con los
  tokens de `DESIGN.md` (dark cinematic, sin Tailwind), mobile-first.

- [x] **35-T9 — `app/admin/auditoria/`: `page.tsx` + `AuditoriaFiltros.tsx`**
  Satisfies: US-2
  Depends on: 35-T6, 35-T8
  Notes: Server Component que consulta `listarAuditLog` con `createServiceRoleClient()`.
  Lista: fecha, actor (email), acción, entidad, `anterior → nuevo`. `AuditoriaFiltros` =
  filtro por actor (search de email) + rango de fechas; "Cargar más" con el keyset. **Sólo
  lectura** — sin editar ni borrar. Validar `searchParams` con Zod; si es inválido, no
  consultar la base y mostrar "filtro inválido" (design.md §"Notas de traceabilidad": en
  Server Components el "400" del AC se traduce a "la página no consulta y muestra el
  error"). Primitivas: `TextField`, `Button`.

- [x] **35-T10 — `rls.test.ts`: variante `withPolicyDisabled` sobre `admin_audit_log_select_admin`**
  Satisfies: US-2
  Depends on: 35-T1
  Notes: Agregar al `describe` existente de `admin_audit_log_select_admin` (línea ~294 de
  `test/integration/rls.test.ts`) la variante
  `withPolicyDisabled(admin, "public", "admin_audit_log", "admin_audit_log_select_admin",
  …)`: con la policy desactivada (y siendo la única de SELECT), **ni el usuario admin lee la
  tabla → 0 filas**; con la policy activa, el hermano espera ≥1. **Este es el test que pone
  CI en rojo si alguien desactiva la policy** (constraint de requirements.md). El `describe`
  de RLS de `nivel_overrides` se **enuncia** en el diseño pero se implementa en 36-T12
  (la tabla no existe hasta VGRP-36).

- [x] **35-T11 — Documentar alta de admin (`docs/SUPABASE-SETUP.md`) y el hueco de auditoría (`docs/OBSERVABILIDAD.md`)**
  Satisfies: US-1, US-2
  Notes: En `docs/SUPABASE-SETUP.md`: procedimiento de alta de admin de design.md §"Alta de
  admin" — SQL directo sobre `profiles.rol` (`begin; select set_config('request.jwt.claims',
  '{"role":"service_role"}', true); update public.profiles set rol='admin' where email=…;
  commit;`), prerequisito (la persona ya registrada), propagación al claim por el Auth Hook
  tras renovar sesión, y que **no hay** pantalla/endpoint/seed para crear admins. En
  `docs/OBSERVABILIDAD.md`: el comportamiento best-effort de `conAuditoria` cuando el insert
  de auditoría falla post-mutación → `Sentry.captureException` con tag `admin-audit-gap`,
  severidad alta, es un **incidente** (hueco de auditoría), no un error de request.

- [x] **35-T12 — Verificar el workaround del trigger `profiles_guard_nivel_rol` para el alta de admin**
  Satisfies: US-1
  Depends on: 35-T11
  ESTADO: **VERIFICADO por el coordinador el 2026-09-05** contra el proyecto
  real. `set_config('request.jwt.claims','{"role":"service_role"}', true)` hace
  que `auth.role()` devuelva `'service_role'`, que es lo que compara el guard
  → la opción `set_config` (en la misma transacción que el `update`) funciona.
  `docs/SUPABASE-SETUP.md` §9bis quedó con esa única opción y la nota de
  verificación. No hace falta desactivar el trigger.
  Notes: `profiles_guard_nivel_rol_trigger` (`init_plataforma.sql §5`) aborta cualquier
  UPDATE de `nivel`/`rol` salvo `auth.role() = 'service_role'`. Verificar contra el proyecto
  real cuál de las dos vías funciona desde el SQL editor / MCP `execute_sql`: (a)
  `set_config('request.jwt.claims', '{"role":"service_role"}', true)` en la misma
  transacción, o (b) `alter table public.profiles disable trigger
  profiles_guard_nivel_rol_trigger; …; enable trigger`. Documentar en `docs/SUPABASE-SETUP.md`
  **la que efectivamente funcione** (design.md §"Alta de admin" → "Verificación pendiente").
  Si el MCP no está autorizado, dejar anotado como pendiente para el coordinador.

- [x] **35-T13 — `e2e/admin-acceso.spec.ts` (Playwright)**
  Satisfies: US-1
  Depends on: 35-T4, 35-T8
  Notes: (1) login como `principiante@test.og-circle.invalid` → navegar `/admin` → ve el
  404, **no** el panel; (2) login como `admin@test.og-circle.invalid` → `/admin` → ve el
  shell y la nav. El runner e2e ya está listo (VGRP-45). Puede ir último del paquete junto
  con el cierre.

- [x] **35-T14 — `/simplify` sobre el código nuevo del paquete**
  Satisfies: US-1, US-2
  Depends on: 35-T3, 35-T4, 35-T6, 35-T8, 35-T9
  Notes: Pase de calidad (reuse/eficiencia/altitud) antes de la PR — CLAUDE.md item 4. No
  reemplaza el code-review automático del commit.

- [x] **35-T15 — `/design-critique` sobre shell, índice y pantalla de auditoría**
  Satisfies: US-1, US-2
  Depends on: 35-T8, 35-T9
  Notes: Obligatorio por CLAUDE.md item 2 (UI nueva). Cubrir `layout.tsx`, `page.tsx`,
  `auditoria/page.tsx` + `not-found.tsx`. Aplicar el feedback antes de dar las pantallas por
  terminadas.

- [~] **35-T16 — Abrir PR de VGRP-35**
  Satisfies: US-1, US-2
  Depends on: 35-T1..35-T15
  ESTADO (impl VGRP-35): rama `bloque-5/vgrp-35-panel-admin-base` pusheada a
  `origin` (commit `a56781e`). `gh pr create` quedó bloqueado por el
  clasificador de permisos de la sesión → **el coordinador abre la PR** con el
  cuerpo ya redactado (link "Create a pull request" que devolvió el push, o el
  texto guardado en el scratchpad de la sesión). Base `main`.
  Notes: Verificar la DoD del paquete completa. PR describiendo el ticket (rol + protección
  de rutas + audit log + migración de índices + doc de alta de admin). Push por Claude Code.

---

## Paquete VGRP-36 — Panel admin: gestión de usuarios y activación manual de nivel

### Para el subagente que tome este paquete

- **Rama a crear:** `bloque-5/vgrp-36-usuarios-activar-nivel` (desde `main`, con VGRP-35 ya adentro).
- **Qué asume ya mergeado:** **VGRP-35 en `main`** — usa `conAuditoria`/`registrarAccionAdmin`
  (`lib/data/admin/audit-log.ts`), `requireAdmin` (`lib/auth/admin.ts`), el shell/`layout.tsx`
  y `admin.module.css`. Es independiente de VGRP-37.
- **Archivos que va a crear/modificar:**
  - `supabase/migrations/20260905030100_nivel_overrides.sql` (crear)
  - `lib/database.types.ts` (regenerar por MCP)
  - `lib/data/admin/usuarios.ts`, `lib/data/admin/usuarios.test.ts` (crear)
  - `app/admin/usuarios/page.tsx`, `app/admin/usuarios/UsuariosFiltros.tsx` (crear)
  - `app/admin/usuarios/[id]/page.tsx`, `app/admin/usuarios/[id]/CambiarNivelForm.tsx` (crear)
  - `app/api/admin/usuarios/[id]/nivel/route.ts`, `.../route.test.ts` (crear)
  - `test/helpers/cleanup.ts` (modificar — aprender `nivel_overrides`)
  - `test/integration/rls.test.ts` (modificar — `describe` de `nivel_overrides`)
  - `e2e/admin-activar-nivel.spec.ts` (crear)
- **Definition of done del paquete:**
  - `pnpm typecheck` + `pnpm biome ci` + `pnpm build` + `pnpm test` + `pnpm test:e2e` en verde.
  - **`test/integration/pagos.test.ts` sigue verde** tras `nivel_vigente()` v3 (verificación
    explícita, 36-T3).
  - Migración `nivel_overrides` aplicada por MCP y versionada; tipos regenerados;
    `get_advisors` corrido y resuelto/anotado.
  - `/simplify` corrido sobre el código nuevo.
  - `/design-critique` corrido sobre `usuarios/page.tsx`, `usuarios/[id]/page.tsx` y
    `CambiarNivelForm`. `/design-system` **sólo si** `/design-critique` decide agregar
    `Select`/`Textarea` a `components/ui` en vez de nativos locales (CLAUDE.md item 3).
  - PR abierta describiendo VGRP-36. Commits y push por Claude Code.

### Tareas

- [x] **36-T1 — Migración `20260905030100_nivel_overrides.sql`**
  Satisfies: US-4
  ESTADO: **APLICADA el 2026-09-06** con `apply_migration` (MCP de Supabase,
  proyecto `og-circle` / `hsmodrhbwkromoixrxrt` / `sa-east-1`). Tabla +
  índices + RLS default-deny + `nivel_vigente()` v3 en la base. Archivo
  versionado con header estilo checklist. Tipos regenerados en 36-T2.
  Notes: Contenido exacto en design.md §"VGRP-36 — `nivel_overrides` + `nivel_vigente()` v3":
  - Tabla `public.nivel_overrides` (`id`, `user_id` FK → `profiles`, `nivel nivel_acceso`,
    `motivo text not null`, `actor_id` FK → `profiles` nullable, `created_at`). Append-only:
    **sin** UPDATE/DELETE (mismo criterio que `pagos`). `comment on table` como en el diseño.
  - Índice `nivel_overrides_user_created_idx (user_id, created_at desc)`.
  - `enable row level security` + `revoke all … from anon, authenticated` + `grant all … to
    service_role` → **RLS default-deny**, sin policies para `authenticated` (sólo service
    role, que bypassa RLS, escribe y lee).
  - `create or replace function public.nivel_vigente(p_user_id uuid)` **v3** — el bloque SQL
    completo del diseño. **Gotcha:** con **cero** filas en `nivel_overrides` el resultado
    debe ser **idéntico** a la v2 actual (`20260905023031_nivel_vigente_precedencia.sql`).
    El override "gana" sólo si su `created_at` es `>=` al del último pago `approved` no
    reembolsado. La comparación de niveles se apoya en el orden del enum
    (`avanzado > principiante > ninguno`).
  - Índice `profiles_created_at_idx (created_at desc, id desc)` para el listado de usuarios.
    **Sin** índice trigram para `email ilike` (decisión del diseño a la escala actual).
  Aplicar por MCP y versionar (ver nota transversal de migraciones).

- [x] **36-T2 — Regenerar `lib/database.types.ts` por MCP (`generate_typescript_types`)**
  Satisfies: US-3, US-4
  Depends on: 36-T1
  Notes: Debe sumar `nivel_overrides` (Row/Insert/Update) a `Database["public"]["Tables"]`.
  `Tables<"nivel_overrides">` = `{ id, user_id, nivel: NivelAcceso, motivo, actor_id: string
  | null, created_at }`. Commitear el diff generado, sin ediciones a mano.

- [x] **36-T3 — Verificar que `test/integration/pagos.test.ts` sigue verde tras `nivel_vigente()` v3**
  Satisfies: US-4
  Depends on: 36-T1
  ESTADO: **VERDE** — `pnpm test test/integration/pagos.test.ts` → 5/5 pasan
  SIN tocar el archivo. Con cero overrides el CTE `ledger` de la v3 devuelve
  exactamente `order by nivel_comprado desc limit 1` (v2). No hizo falta v4.
  **Actualización 2026-09-06:** el hueco #1 (design.md §"Open questions / risks"
  #1 — la semántica del `at` del `ledger`, que usaba `max(created_at)` global)
  quedó **resuelto con la opción B** (decidida por el coordinador): `ledger`
  selecciona el pago approved sin refunded posterior de MAYOR nivel y `ledger.at`
  es el `created_at` de ESE pago, así el override se compara siempre contra el
  pago del nivel que habría ganado. Migración re-aplicada por MCP
  (`nivel_vigente_at_del_pago_de_mayor_nivel`); test nuevo del escenario en
  `lib/data/admin/usuarios.test.ts` ("opción B: el override gana contra el pago
  de MAYOR nivel viejo..."). `pagos.test.ts` sigue 5/5.
  Notes: `nivel_vigente()` es función compartida con el webhook (camino caliente). Correr
  `pnpm test test/integration/pagos.test.ts` y confirmar que **todos** los casos siguen
  pasando sin tocar el archivo — con 0 overrides el comportamiento tiene que ser idéntico al
  de la v2 (design.md §"Open questions / risks" #1). Si algo cambia, es bug de la migración,
  no del test: revisar la v3 antes de seguir. **Bloqueante para abrir la PR.**

- [x] **36-T4 — `get_advisors` tras aplicar la migración**
  Satisfies: US-4
  Depends on: 36-T1
  ESTADO: **CORRIDO** (security + performance). `rls_enabled_no_policy` INFO
  sobre `nivel_overrides` = intencional (default-deny, ver design.md). Nuevo
  INFO `unindexed_foreign_keys` sobre `nivel_overrides_actor_id_fkey` — se
  deja anotado (tabla append-only chica, lookups por `actor_id` raros; el
  diseño no pidió ese índice). `unused_index` INFO en los índices nuevos =
  esperado sin tráfico. `auth_leaked_password_protection` WARN =
  pre-existente y ajeno.
  Notes: Correr `get_advisors` (security + performance). Prestar atención a advisors sobre
  RLS de `nivel_overrides` (default-deny es intencional) y sobre la nueva función. Resolver
  o anotar en la PR.

- [x] **36-T5 — Actualizar `test/helpers/cleanup.ts` para borrar `nivel_overrides`**
  Satisfies: US-4
  Depends on: 36-T1
  Notes: `nivel_overrides.user_id` y `nivel_overrides.actor_id` son FKs a `profiles` **sin
  `ON DELETE CASCADE`** (igual que `pagos` y `admin_audit_log`). `deleteFkDependents()` y
  `cleanupAllTestArtifacts()` deben borrar `nivel_overrides` **por `user_id` y por
  `actor_id`** **antes** de borrar el usuario (y antes/junto con el borrado de `pagos` y
  `admin_audit_log`), o el `DELETE` de `auth.users` falla por violación de FK y corta la
  limpieza a mitad (design.md §"Cambio requerido en `test/helpers/cleanup.ts`"). Obligatorio
  en esta PR o la limpieza de tests se rompe.

- [x] **36-T6 — `lib/data/admin/usuarios.ts`: `listarUsuarios`, `obtenerUsuario`, `activarNivel`**
  Satisfies: US-3, US-4
  Depends on: 36-T2
  Notes: `import "server-only"`. Cliente inyectado como parámetro (patrón `lib/data/pagos.ts`).
  Contratos en design.md §"Interfaces / contracts → `lib/data/admin/usuarios.ts`":
  - `listarUsuarios(admin, filtros)` — `{ q?, nivel?, limit, cursor }` con Zod. `q` se aplica
    como `.ilike("email", \`%${q}%\`)` **en la base** (US-3: la búsqueda no filtra en cliente,
    no expone filas que no matchean). Salida `{ usuarios: Pick<Profile,
    "id"|"email"|"nivel"|"created_at">[], nextCursor }`. Orden `created_at desc, id desc`,
    **keyset** (no offset).
  - `obtenerUsuario(admin, id)` — `{ perfil, nivelActivo, pagos: PagoRow[], overrides:
    NivelOverride[] } | null`. `nivelActivo` = `nivel_vigente(id)` vía RPC. `pagos` = ledger
    completo del usuario `order by created_at desc`. `id` sin match → `null`.
  - `activarNivel(admin, { userId, nivel, motivo, actorId })` — **reutiliza `proyectarNivel`
    de `lib/data/pagos.ts`, no reimplementa nada**. Flujo: (1) lee `profiles.nivel` actual →
    `nivelAnterior`; si no hay fila → lanza `UsuarioNoEncontrado` (clase de error exportada
    por este módulo; el handler la mapea a 404). (2) `insert into nivel_overrides (user_id,
    nivel, motivo, actor_id)`. (3) `await proyectarNivel(admin, userId)` → `nivelNuevo`. (4)
    devuelve `{ resultado: { nivelAnterior, nivelNuevo }, valorAnterior: { nivel:
    nivelAnterior }, valorNuevo: { nivel: nivelNuevo, motivo } }` — la forma que `conAuditoria`
    espera. **No** consulta `pagos` nunca (US-4: funciona sin pago de MP). Idempotente: mismo
    nivel dos veces → dos filas de override, `proyectarNivel` recalcula igual, `nivelAnterior
    == nivelNuevo`.
  - `activarNivel`/`reprocesarPago` **no escriben `profiles`/`pagos` fuera del closure que
    `conAuditoria` ejecuta** — es lo que garantiza que toda mutación pase por la auditoría.

- [x] **36-T7 — `lib/data/admin/usuarios.test.ts` (integración)**
  Satisfies: US-3, US-4
  Depends on: 36-T6
  Notes: Casos de design.md §"Plan de tests → VGRP-36 → `usuarios.test.ts`": `listarUsuarios({
  q })` coincidencia parcial de email, sólo devuelve los que matchean (crea 2, busca por
  fragmento de uno, espera 1); filtro por `nivel`; keyset (2 páginas disjuntas);
  `obtenerUsuario(id)` → perfil + pagos + progreso + overrides, `id` inexistente → `null`;
  `activarNivel` → fija `profiles.nivel` y `app_metadata` al nivel pedido y devuelve
  `nivelAnterior`/`nivelNuevo`; funciona **sin ningún pago** (caso transferencia/USDT);
  idempotente (mismo nivel dos veces, sin error, `anterior == nuevo`); **baja a `ninguno`**
  funciona; baja a `principiante` con un pago `approved` de `avanzado` → queda en
  `principiante` (el override, más nuevo, gana); un pago `approved` de MP **posterior** al
  override lo supera (re-proyección deja el nivel del pago). Usar `createAuthenticatedUser`
  y limpieza automática.

- [x] **36-T8 — `POST /api/admin/usuarios/[id]/nivel/route.ts`**
  Satisfies: US-4
  Depends on: 36-T6
  Notes: Esqueleto en design.md §"`POST /api/admin/usuarios/[id]/nivel`". `export const
  runtime = "nodejs"`, `export const dynamic = "force-dynamic"`. Orden: (1) `requireAdmin()`
  → si `!ok` devolver `guard.response` (401/404) **antes de cualquier lógica**; (2) `const {
  id } = await params` y validar `z.uuid().safeParse(id)` → `404 { error: "No encontrado." }`
  si falla (nunca 403); (3) `bodySchema = z.object({ nivel: z.enum(["ninguno","principiante",
  "avanzado"]), motivo: z.string().trim().min(1, "El motivo es obligatorio.") })` sobre
  `await req.json().catch(() => null)` → `400 { error, fieldErrors: z.flattenError(...) }` si
  falla, sin cambiar nada; (4) `createServiceRoleClient()` + `conAuditoria(admin, { actorId,
  accion: "cambiar_nivel", entidad: "profiles", entidadId: id }, () => activarNivel(admin, {
  userId: id, actorId, ...parsed.data }))`; (5) `catch`: `UsuarioNoEncontrado` → `404 {
  error: "Usuario no encontrado." }` **sin audit log**; cualquier otro → `Sentry.captureException`
  + `500`. Tabla de errores completa en el diseño.

- [x] **36-T9 — `app/api/admin/usuarios/[id]/nivel/route.test.ts` (unit)**
  Satisfies: US-1, US-4
  Depends on: 36-T8
  Notes: Estilo `app/api/webhooks/mercadopago/route.test.ts` — `vi.mock` de
  `@/lib/data/admin/usuarios`, `@/lib/data/admin/audit-log`, `@/lib/auth/admin`,
  `@/lib/supabase/service-role`; import dinámico del módulo bajo test. Casos de design.md
  §"Plan de tests → VGRP-36 → `route.test.ts`": sin sesión → `401`; `rol='user'` → `404` y
  **no** llama a `activarNivel`; body sin `motivo` / `motivo` en blanco / `nivel` inválido →
  `400` y `activarNivel` no se llama en los tres; `id` no-uuid → `404`; usuario inexistente
  (`activarNivel` lanza `UsuarioNoEncontrado`) → `404` sin audit; happy path → `200` y
  `conAuditoria` invocado con `accion='cambiar_nivel'`, `entidad='profiles'`, `valorAnterior`/
  `valorNuevo` esperados.

- [x] **36-T10 — `app/admin/usuarios/page.tsx` + `UsuariosFiltros.tsx`**
  Satisfies: US-3
  Depends on: 36-T6, Paquete VGRP-35 mergeado
  Notes: Server Component que consulta `listarUsuarios` con `createServiceRoleClient()`.
  Search por email (`TextField`) + `<select>` de nivel + lista (email, nivel, alta) +
  "Cargar más" (keyset). **Mobile: cards, no tabla.** Validar `searchParams` con Zod → si es
  inválido, no consultar y mostrar el error (no hay `400` HTTP en Server Components —
  design.md §"Notas de traceabilidad"). `<select>`/`<textarea>` nativos estilados en
  `admin.module.css` (recomendación del diseño; queda para `/design-critique` decidir si van
  a `components/ui`).

- [x] **36-T11 — `app/admin/usuarios/[id]/page.tsx` + `CambiarNivelForm.tsx`**
  Satisfies: US-3, US-4
  Depends on: 36-T6, 36-T8
  Notes: Server Component: datos del usuario, nivel activo, `progreso` (JSON formateado),
  historial de pagos (mini-ledger), historial de overrides. `id` sin match → `notFound()`
  (US-3: 404). `CambiarNivelForm` = **Client Component**: `<select>` nivel + `<textarea>`
  motivo + submit → `fetch` `POST /api/admin/usuarios/[id]/nivel` → refrescar (`router.refresh()`).
  Mostrar `fieldErrors` del `400` con `FormError`. Primitivas: `Button`, `FormError`,
  `TextField`.

- [x] **36-T12 — `rls.test.ts`: `describe` de `nivel_overrides` (default-deny para `authenticated`)**
  Satisfies: US-4
  Depends on: 36-T1
  Notes: Nuevo `describe` en `test/integration/rls.test.ts`: un usuario `authenticated`
  común (cliente anon con su token) **no puede `select` ni `insert`** sobre `nivel_overrides`
  (0 filas / error). La tabla no tiene policies para `authenticated` → RLS deniega todo por
  default (design.md §"Sanitización de acceso admin en la capa de datos").

- [x] **36-T13 — `e2e/admin-activar-nivel.spec.ts` (Playwright)**
  Satisfies: US-3, US-4
  Depends on: 36-T10, 36-T11
  Notes: Admin busca un usuario por email, abre el detalle, cambia el nivel indicando un
  motivo, ve la confirmación y el nivel nuevo reflejado. Puede ir último del paquete.

- [x] **36-T14 — `/simplify` sobre el código nuevo del paquete**
  Satisfies: US-3, US-4
  Depends on: 36-T6, 36-T8, 36-T10, 36-T11
  ESTADO: aplicado. (1) Extraído `lib/data/admin/keyset.ts` compartido
  (encode/decode/keysetFilter/escaparLike) — `usuarios.ts` y `audit-log.ts`
  lo usan en vez de duplicar el cursor + el escape de LIKE. (2)
  `obtenerUsuario` corre sus 3 consultas independientes (rpc + pagos +
  overrides) con `Promise.all` en vez de en serie.

- [x] **36-T15 — `/design-critique` sobre listado, detalle y `CambiarNivelForm`**
  Satisfies: US-3, US-4
  Depends on: 36-T10, 36-T11
  ESTADO: corrido. Decisión: se mantienen `<select>`/`<textarea>` NATIVOS
  estilados en `admin.module.css` (recomendación del diseño para herramienta
  interna) → **NO** se agregan `Select`/`Textarea` a `components/ui`, **NO**
  se corre `/design-system`. Fix aplicado: `proveedor_ref` y `motivo` en los
  mini-ledgers pasan de un badge en mayúsculas (ilegible para strings largos)
  a texto secundario que se corta (`.filaMeta`).
  Notes: Obligatorio (CLAUDE.md item 2). Si el critique decide `Select`/`Textarea`
  compartidos en `components/ui`, agregar esos componentes y correr **`/design-system`**
  (CLAUDE.md item 3) — eso suma alcance a esta PR (design.md §"Open questions / risks" #9).

- [~] **36-T16 — Abrir PR de VGRP-36**
  Satisfies: US-3, US-4
  Depends on: 36-T1..36-T15
  ESTADO: rama `bloque-5/vgrp-36-usuarios-activar-nivel` pusheada a `origin`
  (commit `1cbc1b3`). `gh` no está instalado → **el coordinador abre la PR**
  con el cuerpo redactado en el scratchpad de la sesión
  (`PR-VGRP-36-body.md`). Base `main`. DoD del paquete verificada (ver el
  cuerpo de la PR).
  Notes: Verificar la DoD del paquete, con 36-T3 (pagos.test.ts verde) incluido. PR
  describiendo el ticket (gestión de usuarios + activación manual + `nivel_overrides` +
  `nivel_vigente` v3 + cambio en `cleanup.ts`). Push por Claude Code.

---

## Paquete VGRP-37 — Panel admin: ledger de pagos y reproceso de webhook

### Para el subagente que tome este paquete

- **Rama a crear:** `bloque-5/vgrp-37-pagos-ledger-reproceso` (desde `main`, con VGRP-35 ya adentro).
- **Qué asume ya mergeado:** **VGRP-35 en `main`** — usa `conAuditoria` (`lib/data/admin/audit-log.ts`),
  `requireAdmin` (`lib/auth/admin.ts`), el shell/`layout.tsx`. **Es independiente de VGRP-36**
  (no usa `nivel_overrides` ni `usuarios.ts`), pero se implementa después de 36 por prolijidad
  de review.
- **Archivos que va a crear/modificar:**
  - `supabase/migrations/20260905030200_admin_pagos_ledger.sql` (crear)
  - `lib/database.types.ts` (regenerar por MCP)
  - `lib/data/admin/pagos.ts`, `lib/data/admin/pagos.test.ts` (crear) — **ojo: no confundir
    con `lib/data/pagos.ts`**, que es el módulo compartido con el webhook y **no se toca**.
  - `app/admin/pagos/page.tsx`, `app/admin/pagos/PagosFiltros.tsx` (crear)
  - `app/admin/pagos/[id]/page.tsx`, `app/admin/pagos/[id]/ReprocesarButton.tsx` (crear)
  - `app/api/admin/pagos/[id]/reprocesar/route.ts`, `.../route.test.ts` (crear)
  - `app/admin/page.tsx` (modificar — agregar el callout `totalSinAplicar` diferido de VGRP-35)
  - `e2e/admin-reprocesar-pago.spec.ts` (crear)
- **Definition of done del paquete:**
  - `pnpm typecheck` + `pnpm biome ci` + `pnpm build` + `pnpm test` + `pnpm test:e2e` en verde.
  - Migración de la vista + índice aplicada por MCP y versionada; tipos regenerados;
    `get_advisors` corrido — **prestar atención a un posible advisor sobre la vista
    `security_invoker`** (se consulta por service role, no hay fuga; verificar que no sea
    bloqueante y documentarlo — design.md §"Open questions / risks" #3).
  - `/simplify` corrido sobre el código nuevo.
  - `/design-critique` corrido sobre `pagos/page.tsx` y `pagos/[id]/page.tsx`.
  - PR abierta describiendo VGRP-37. Commits y push por Claude Code.

### Tareas

- [x] **37-T1 — Migración `20260905030200_admin_pagos_ledger.sql`**
  Satisfies: US-5
  ESTADO: **APLICADA el 2026-09-06** con `apply_migration` (MCP de Supabase,
  proyecto `og-circle` / `hsmodrhbwkromoixrxrt` / `sa-east-1`). Vista
  `admin_pagos_ledger` (`security_invoker = true`, `revoke` anon/authenticated,
  `grant select` a service_role) + columna calculada `sin_aplicar` (`>` sobre el
  enum) + índice `pagos_created_at_idx`. Archivo versionado con header checklist.
  Notes: Contenido exacto en design.md §"VGRP-37 — vista `admin_pagos_ledger`":
  - `create view public.admin_pagos_ledger with (security_invoker = true) as select …` — las
    columnas del diseño (`id, user_id, proveedor, proveedor_ref, nivel_comprado, monto_ars,
    estado, created_at`, `pr.email as user_email`, `pr.nivel as user_nivel_actual`) + la
    columna calculada **`sin_aplicar`**: `p.estado = 'approved' and not exists (refunded del
    mismo proveedor_ref) and p.nivel_comprado > pr.nivel`. **Gotcha:** la comparación es
    `>` sobre el enum — es lo que hace correcto el caso "compró Principiante y después
    Avanzado" (la fila de Principiante nunca se marca porque `principiante > avanzado` es
    falso). `payload_raw` **no** va en la vista (se sanea sólo en el detalle).
  - `revoke all on public.admin_pagos_ledger from anon, authenticated;` +
    `grant select … to service_role;`
  - Índice `pagos_created_at_idx (created_at desc, id desc)` para el orden global del ledger.
    `pagos_proveedor_ref_idx` ya existe → la búsqueda por `proveedor_ref` no necesita índice
    nuevo.
  Aplicar por MCP y versionar (ver nota transversal de migraciones).

- [x] **37-T2 — Regenerar `lib/database.types.ts` por MCP (`generate_typescript_types`)**
  Satisfies: US-5
  Depends on: 37-T1
  ESTADO: **REGENERADO** con `generate_typescript_types`. Suma
  `admin_pagos_ledger` a `Database["public"]["Views"]`. Re-aplicados a mano los 2
  ajustes conocidos que el generador pisa (`test_create_policy` / 
  `test_get_policy_definition`: `p_qual`/`p_with_check`/`qual`/`with_check` →
  `string | null`; `roles` → `string[]`) y re-agregados los exports
  `NivelAcceso`/`RolUsuario`. Formateado con biome. Diff = sólo el bloque Views +
  header.
  Notes: Debe sumar la vista `admin_pagos_ledger` a `Database["public"]["Views"]`. Forma
  esperada de una fila (`PagoLedgerRow`) en design.md §"Tipos TS". Commitear el diff
  generado sin ediciones a mano.

- [x] **37-T3 — `get_advisors` tras aplicar la migración**
  Satisfies: US-5
  Depends on: 37-T1
  ESTADO: **CORRIDO** (security + performance) el 2026-09-06. La vista
  `admin_pagos_ledger` **NO dispara ningún advisor** (ni `security_definer_view`
  ni otro) — es `security_invoker = true` y no se expone a anon/authenticated.
  Único hallazgo nuevo: `unused_index` INFO sobre `pagos_created_at_idx`
  (esperado, sin tráfico). Pre-existentes y ajenos:
  `auth_leaked_password_protection` WARN, `rls_enabled_no_policy` /
  `unindexed_foreign_keys` sobre `nivel_overrides` (VGRP-36), `unused_index` de
  los índices de VGRP-35/36. Nada bloqueante. Documentado en la migración y la PR.
  Notes: Correr `get_advisors` (security + performance). Verificar específicamente si marca
  la vista `security_invoker` como advisor; como se consulta por service role no hay fuga,
  pero hay que confirmar que **no dispara un advisor bloqueante** y documentarlo en la PR
  (design.md §"Open questions / risks" #3).

- [x] **37-T4 — `sanitizarPayloadRaw(raw)` + test unit puro**
  Satisfies: US-5
  Notes: Implementar según design.md §"`sanitizarPayloadRaw`": **allowlist**, no denylist.
  `CAMPOS_VISIBLES` = los 14 campos de diagnóstico del diseño; `payer` filtrado a
  `PAYER_VISIBLE = ["email", "identification"]`. Todo lo demás se omite (incluye `card`,
  `token`, credenciales, headers). Segunda pasada defensiva: sobre el objeto ya filtrado,
  redactar cualquier clave que matchee `/token|secret|password|authorization|signature|api[_-]?key/i`
  → `"[redactado]"`. Puede vivir en `lib/data/admin/pagos.ts` o archivo aparte. Test unit
  puro (design.md §"Plan de tests → VGRP-37 → `sanitizarPayloadRaw`"): conserva los campos
  de la allowlist; descarta claves desconocidas; descarta `card`/`token`; redacta claves
  tipo `*_secret`/`authorization`; filtra `payer` al subconjunto.

- [x] **37-T5 — `lib/data/admin/pagos.ts`: `listarPagos`, `obtenerPago`, `reprocesarPago`**
  Satisfies: US-5, US-6
  Depends on: 37-T2
  Notes: `import "server-only"`. Cliente inyectado como parámetro (patrón `lib/data/pagos.ts`).
  Contratos en design.md §"Interfaces / contracts → `lib/data/admin/pagos.ts`":
  - `listarPagos(admin, filtros)` — `{ estado?, desde?, hasta?, proveedorRef?, limit, cursor }`
    con Zod. Consulta la **vista `admin_pagos_ledger`** (compone con `.eq().ilike().order().limit()`
    de supabase-js). `proveedorRef` como `.ilike` (parcial, más útil para diagnóstico).
    Salida `{ pagos: PagoLedgerRow[], nextCursor, totalSinAplicar }`. Orden `created_at desc,
    id desc`, **keyset**. `totalSinAplicar` = `count` aparte (`where sin_aplicar`, sin
    paginar) para el badge del índice.
  - `obtenerPago(admin, id)` — `{ pago: PagoRow, payloadRawSanitizado: Json, sinAplicar:
    boolean, userEmail: string } | null`. `null` → `notFound()`. Aplica `sanitizarPayloadRaw`
    sobre `payload_raw`.
  - `reprocesarPago(admin, { pagoId, actorId })` — **reutiliza `proyectarNivel` de
    `lib/data/pagos.ts`; NO llama a `insertarPago` ni inserta nada** (la fila del pago ya
    existe; reprocesar es *sólo* re-proyectar). Flujo: (1) `select * from pagos where id =
    pagoId` → si no hay → lanza `PagoNoEncontrado` (handler → 404, sin audit). (2) si
    `pago.estado !== 'approved'` → lanza `PagoNoReprocesable` (handler → **409**, sin audit,
    sin cambios). (3) lee `profiles.nivel` del `pago.user_id` → `nivelAnterior`. (4) `await
    proyectarNivel(admin, pago.user_id)` → `nivelNuevo`. (5) devuelve `{ resultado: {
    nivelAnterior, nivelNuevo }, valorAnterior: { nivel: nivelAnterior }, valorNuevo: {
    nivel: nivelNuevo } }`. `PagoNoEncontrado`/`PagoNoReprocesable` = clases de error
    exportadas por este módulo. Idempotente: `proyectarNivel` es derivación pura del ledger
    → correrla dos veces sin pagos nuevos = mismo resultado, cero filas nuevas en `pagos`.

- [x] **37-T6 — `lib/data/admin/pagos.test.ts` (integración)**
  Satisfies: US-5, US-6
  Depends on: 37-T5
  Notes: Casos de design.md §"Plan de tests → VGRP-37 → `pagos.test.ts`": `listarPagos` —
  filtro por `estado`, por rango de fechas, por `proveedor_ref`; keyset. `sin_aplicar`:
  `true` para un `approved` cuyo `nivel_comprado` supera `profiles.nivel`; `false` cuando el
  perfil ya está en un nivel ≥ (caso Principiante-después-Avanzado); `false` para un
  `approved` con `refunded` del mismo `proveedor_ref`. `totalSinAplicar` cuenta bien.
  `reprocesarPago`: pago `approved` no aplicado → re-proyecta, `profiles.nivel` sube, **cero
  filas nuevas en `pagos`** (contar antes/después); pago ya aplicado → idempotente, nivel no
  cambia, sin error; `estado != 'approved'` → lanza `PagoNoReprocesable`; `id` inexistente →
  lanza `PagoNoEncontrado`. Para sembrar el caso "sin aplicar": `insert` directo por service
  role en `pagos` **sin** llamar a `proyectarNivel`.

- [x] **37-T7 — `app/api/admin/pagos/[id]/reprocesar/route.ts`**
  Satisfies: US-6
  Depends on: 37-T5
  Notes: `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`. Path
  `id` (uuid); sin body (o body vacío ignorado). Orden: (1) `requireAdmin()` → `!ok` devuelve
  `guard.response` **antes de lógica**; (2) validar `id` uuid → `404` si falla; (3)
  `createServiceRoleClient()` + `conAuditoria(admin, { actorId, accion: "reprocesar_pago",
  entidad: "pagos", entidadId: id }, () => reprocesarPago(admin, { pagoId: id, actorId }))`;
  (4) `catch`: `PagoNoEncontrado` → `404` sin audit; `PagoNoReprocesable` → `409 { error:
  "Sólo se puede reprocesar un pago aprobado." }` sin audit y sin cambios; otro →
  `Sentry.captureException` + `500`. Salida OK: `200 { nivelAnterior, nivelNuevo }` + fila
  en `admin_audit_log`. Tabla de errores completa en design.md §"`POST /api/admin/pagos/[id]/reprocesar`".

- [x] **37-T8 — `app/api/admin/pagos/[id]/reprocesar/route.test.ts` (unit)**
  Satisfies: US-1, US-6
  Depends on: 37-T7
  Notes: Estilo `route.test.ts` del webhook (`vi.mock` + import dinámico). Casos de design.md
  §"Plan de tests → VGRP-37 → `route.test.ts`": sin sesión → `401`; `rol='user'` → `404` sin
  lógica (no llama a `reprocesarPago`); `id` no-uuid → `404`; pago inexistente → `404` sin
  audit; `estado != 'approved'` → `409` sin audit y sin cambios; happy path → `200` +
  `conAuditoria` invocado con `accion='reprocesar_pago'`, `entidad='pagos'`, `entidad_id=<id>`.

- [x] **37-T9 — `app/admin/pagos/page.tsx` + `PagosFiltros.tsx`**
  Satisfies: US-5
  Depends on: 37-T5, Paquete VGRP-35 mergeado
  Notes: Server Component que consulta `listarPagos` con `createServiceRoleClient()`.
  Filtros (`PagosFiltros`): `<select>` estado + rango de fechas + search `proveedor_ref`.
  Ledger con **badge `sin_aplicar` resaltado** por fila (el admin no filtra para
  encontrarlos — los ve de una). "Cargar más" (keyset). Validar `searchParams` con Zod → si
  es inválido, no consultar y mostrar el error. **Sólo lectura** — sin editar ni borrar.
  Primitivas: `TextField`, `Button`; badges locales en `admin.module.css`.

- [x] **37-T10 — `app/admin/pagos/[id]/page.tsx` + `ReprocesarButton.tsx`**
  Satisfies: US-5, US-6
  Depends on: 37-T5, 37-T7
  Notes: Server Component: detalle del pago + `payload_raw` **filtrado** (`sanitizarPayloadRaw`)
  en un `<pre>` con la nota "Vista filtrada para diagnóstico — no es el evento completo".
  `id` sin match → `notFound()`. `ReprocesarButton` = Client Component, **sólo visible si
  `pago.estado === 'approved'`** → `fetch` `POST /api/admin/pagos/[id]/reprocesar` →
  refrescar; mostrar el `409` con `FormError` si el pago no es reprocesable. Primitivas:
  `Button`, `FormError`.

- [x] **37-T11 — Agregar el callout `totalSinAplicar` a `app/admin/page.tsx`**
  Satisfies: US-5
  Depends on: 37-T5
  Notes: Diferido de VGRP-35 (el índice se entregó sin el callout porque la vista
  `admin_pagos_ledger` no existía). Ahora: en `app/admin/page.tsx` sumar el callout con
  `totalSinAplicar` (número ámbar destacado) que **linkea al ledger filtrado** por
  `sin_aplicar`. Obtener el número de `listarPagos` (o un `count` puntual). Es el "el admin
  ve el caso a reparar sin buscarlo" a nivel índice (design.md §"Detección de pago aprobado
  sin nivel aplicado" + §UI).

- [x] **37-T12 — `e2e/admin-reprocesar-pago.spec.ts` (Playwright)**
  Satisfies: US-5, US-6
  Depends on: 37-T9, 37-T10
  Notes: Sembrar un pago `approved` con el nivel **sin aplicar** (insert directo por service
  role, sin proyectar). Admin abre `/admin/pagos`, ve el badge `sin_aplicar`, entra al
  detalle, reprocesa, y el badge desaparece / el nivel del usuario sube. Puede ir último del
  paquete.

- [x] **37-T13 — `/simplify` sobre el código nuevo del paquete**
  Satisfies: US-5, US-6
  Depends on: 37-T4, 37-T5, 37-T7, 37-T9, 37-T10
  ESTADO: corrido. Fix aplicado: `listarPagos` reutiliza `contarPagosSinAplicar`
  (que también usa el callout del índice) en vez de duplicar el `count` query de
  `sin_aplicar`; los dos siguen corriendo en paralelo con el listado. Resto del
  diff ya estaba limpio (keyset/escaparLike reutilizados de `lib/data/admin/keyset.ts`,
  `proyectarNivel` reutilizado sin reimplementar).

- [x] **37-T14 — `/design-critique` sobre el ledger y el detalle de pago**
  Satisfies: US-5, US-6
  Depends on: 37-T9, 37-T10, 37-T11
  ESTADO: corrido sobre `pagos/page.tsx`, `pagos/[id]/page.tsx` y el callout del
  índice. NO se toca `components/ui` → `/design-system` no aplica. Fixes
  aplicados: (1) badge de estado y badge "sin aplicar" separados (antes el badge
  mostraba "sin aplicar" EN LUGAR del estado, se perdía el dato real); (2)
  `TextLink` en vez de `<a className={navLink}>` crudo en el detalle; (3) sin
  `style={{}}` inline — contenedor `.badgeFila`; (4) dato "Estado" no duplicado
  entre la cabecera y el `<dl>`. El badge "sin aplicar" usa acento ámbar +
  borde + el texto lo dice (no depende sólo del color).

- [~] **37-T15 — Abrir PR de VGRP-37**
  Satisfies: US-5, US-6
  ESTADO: rama `bloque-5/vgrp-37-pagos-ledger-reproceso` pusheada a `origin`.
  `gh` no está instalado → **el coordinador abre la PR** con el cuerpo redactado
  en el scratchpad de la sesión (`PR-VGRP-37-body.md`). Base `main`. DoD del
  paquete verificada (ver el cuerpo de la PR).
  Depends on: 37-T1..37-T14
  Notes: Verificar la DoD del paquete. PR describiendo el ticket (ledger de pagos + detección
  "sin aplicar" + reproceso + vista `admin_pagos_ledger` + `sanitizarPayloadRaw`). Push por
  Claude Code.

---

## Orden de ejecución entre paquetes

1. **VGRP-35 se implementa y se mergea primero.** Deja en `main` la infraestructura
   compartida: `middleware.ts` con capa de rol, `lib/auth/admin.ts`, el shell de
   `app/admin/`, `lib/data/admin/audit-log.ts` (`conAuditoria`) y la migración de índices.
2. **VGRP-36 y VGRP-37 parten de `main` con VGRP-35 adentro.** Ambos usan `conAuditoria`,
   `requireAdmin` y el shell; ninguno compila sin VGRP-35 mergeado.
3. **VGRP-36 y VGRP-37 son independientes entre sí** (36 no toca nada de 37 y viceversa),
   pero se hacen **en orden 36 → 37** por prolijidad de review y para no abrir dos PRs
   grandes en paralelo sobre la misma área.
4. **Dependencia no obvia:** el callout `totalSinAplicar` de `app/admin/page.tsx` es UI de
   VGRP-35 pero necesita datos de VGRP-37 → se entrega el índice sin el callout en VGRP-35
   (35-T8) y se agrega en VGRP-37 (37-T11). Si VGRP-37 se pospusiera, el índice queda
   funcional igual, sólo sin ese número.
5. Las 3 migraciones tienen timestamps ordenados (`…030000` < `…030100` < `…030200`) para
   que apliquen en secuencia sin importar el orden real de merge.
