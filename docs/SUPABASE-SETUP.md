# Setup de Supabase

## Estado actual (2026-08-22)

El proyecto **existe y las migraciones ya están aplicadas** contra él, vía
Supabase MCP (no se instaló el CLI en esta máquina — se usó el MCP conectado
a la cuenta de Supabase del usuario):

- **Proyecto**: `og-circle`, ref `hsmodrhbwkromoixrxrt`, región **`sa-east-1`**
  (São Paulo) — confirmado, es la región correcta, ya no es un gate abierto.
- **URL**: `https://hsmodrhbwkromoixrxrt.supabase.co`
- Las 4 tablas (`profiles`, `pagos`, `admin_audit_log`, `leads`) están creadas,
  con RLS activo y las policies de VGRP-15/16 aplicadas.
- El advisor de seguridad corrió limpio (0 warnings) después de revocar
  `execute` público sobre `handle_new_user()` y `profiles_guard_nivel_rol()`
  — el advisor había marcado que quedaban ejecutables vía RPC por
  `anon`/`authenticated` por el default de Postgres.
- `lib/database.types.ts` ya es el archivo **generado de verdad** contra este
  proyecto (`generate_typescript_types`), no el escrito a mano.
- `.env.local` (gitignored) tiene `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` reales. `.env.example` documenta las claves
  sin valores sensibles.
- **Auth Hook registrado y claves ES256 confirmadas** (a mano en el dashboard,
  el MCP no expone esa configuración) — ver sección 8. El gate de VGRP-16
  queda completo.

**`leads` — resuelto (2026-08-22): la landing no está capturando leads
todavía.** No hay dato real en ningún lado (ni Supabase ni `@vercel/kv`) con
el que la tabla `leads` aplicada acá pueda entrar en conflicto — la migración
best-effort de `supabase/migrations/20260822035924_leads.sql` queda como la
única fuente de verdad de acá en adelante, sin necesidad de migrar ni
reconciliar nada.

**Decisión confirmada (2026-08-22): landing y plataforma comparten el mismo
proyecto Supabase** (`og-circle`, `hsmodrhbwkromoixrxrt`, `sa-east-1`) — no
son dos proyectos separados. Cuando se active la captura de leads en la
landing (hoy vive en otro repo/deploy), tiene que apuntar a este mismo
proyecto para terminar en esta tabla. Esto también resuelve de fondo la
contradicción con `STACK.md §3` ("un repo, un deploy") que quedó registrada
en el plan del Bloque 1: los deploys siguen siendo dos (landing y
plataforma, en repos distintos), pero la base de datos es una sola.

## 1. Instalar el Supabase CLI (opcional — las migraciones ya se aplicaron por MCP)

```bash
# alguna de estas, según el sistema — ver docs oficiales de Supabase para la
# opción recomendada actual
npm install -g supabase
# o scoop / brew / etc.
supabase --version
```

## 2. `supabase init` real

Este repo ya tiene `supabase/migrations/` con `.sql` adentro, pero nunca se
corrió `supabase init` de verdad (no hay `supabase/config.toml`). Correr:

```bash
supabase init
```

y revisar que no pise ni borre las migraciones ya escritas.

## 3. Verificar la región del proyecto — CRÍTICO, IRREVERSIBLE

Antes de crear o linkear el proyecto en el dashboard de Supabase, confirmar
que la región sea **sa-east-1**. La región de un proyecto de Supabase **no se
puede cambiar después de creado** — si se creó en otra región, la única
solución es crear un proyecto nuevo y migrar todo. Chequear esto primero,
antes de cualquier otro paso.

## 4. `supabase link`

```bash
supabase link --project-ref <ref-del-proyecto>
```

Pide login (`supabase login`) si no se hizo antes.

## 5. Aplicar las migraciones

Primero en local, para verificar que corren limpio:

```bash
supabase db reset
```

Esto corre todas las migraciones de `supabase/migrations/` contra una base
local desde cero. Revisar que no tire errores — en particular:

- El trigger `on_auth_user_created` sobre `auth.users`.
- Las funciones `nivel_vigente` y `handle_new_user`.
- Que las 4 tablas (`profiles`, `pagos`, `admin_audit_log`, `leads`) queden
  con `row level security` habilitado y las policies correspondientes
  (`select * from pg_policies where schemaname = 'public';`).

**Antes de aplicar `20260822035924_leads.sql` en particular**: confirmar
contra el dashboard del proyecto real si `leads` ya existe desde Fase 1 y si
su forma coincide con la de la migración. Ver el comentario al inicio de ese
archivo — es una migración best-effort, no confirmada.

Una vez que local está bien:

```bash
supabase db push
```

para aplicar contra el proyecto remoto vinculado.

## 6. Regenerar los tipos de TypeScript

`lib/database.types.ts` fue escrito a mano (ver el comentario al inicio del
archivo) porque no había CLI ni proyecto vinculado. En cuanto el proyecto
esté linkeado:

```bash
supabase gen types typescript --linked > lib/database.types.ts
```

y reemplazar el archivo a mano por el generado. Verificar que el diff tenga
sentido (nombres de tablas/columnas, nullability, tipos de enums) antes de
commitear.

## 7. Connection string — pooler en modo transaction, puerto 6543

Para la app (runtime, no migraciones) usar siempre el connection pooler de
Supabase en **modo transaction, puerto 6543** — nunca el puerto 5432
directo salvo para correr migraciones (`supabase db push` / `db reset` sí
usan la conexión directa, eso está bien). Usar 5432 desde la app en runtime
agota las conexiones directas de Postgres rápido bajo cualquier tráfico
concurrente.

Variables de entorno típicas a configurar (nombres exactos a confirmar contra
lo que use el resto del repo):

```
# runtime de la app — pooler, transaction mode
DATABASE_URL=postgres://...:6543/postgres?pgbouncer=true

# sólo para correr migraciones desde CLI/CI
DIRECT_URL=postgres://...:5432/postgres

# runtime de la app — cliente Supabase (lib/auth/server.ts)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## 8. Auth Hook y claves asimétricas — VGRP-16 — ✅ HECHO (2026-08-22)

`supabase/migrations/20260822035925_auth_hook.sql` deja escrita la función
`public.custom_access_token_hook` (con sus grants) que inyecta
`app_metadata.nivel` y `app_metadata.rol` en el JWT. Los dos pasos manuales
que la migración por sí sola no cubre ya se hicieron a mano en el dashboard:

1. **Hook registrado**: Authentication → Hooks → "Customize Access Token
   (JWT) Claims" → activado, tipo Postgres, función
   `public.custom_access_token_hook`. Confirmado con captura del dashboard.

2. **Claves de firma asimétricas**: Project Settings → JWT Keys →
   `CURRENT KEY` es `ECC (P-256)`, es decir ES256 — los proyectos nuevos de
   Supabase ya arrancan con clave asimétrica por defecto, así que este paso
   no requirió acción. La única entrada `Legacy HS256` que aparece está como
   `PREVIOUS KEY`, conservada solo para verificar tokens ya emitidos con esa
   clave hasta que expiren — no firma nada nuevo. **No revocarla todavía**:
   hacerlo invalidaría de golpe cualquier sesión activa firmada con HS256.

Con esto, `lib/auth/server.ts` (`getClaims()`) puede verificar el JWT
localmente contra la clave pública del proyecto, sin roundtrip a Auth
(STACK.md §4) — queda pendiente probarlo end-to-end con un usuario real
(ver sección 9).

Ver `docs/AUTH.md` para el resto del diseño (qué claims exactos, cómo se
resuelve el refresco post-pago, qué expone `lib/auth/`).

## 9bis. Alta de un admin — VGRP-35 (procedimiento manual, sin pantalla ni endpoint)

Decisión cerrada (requirements.md §Non-goals): **no hay pantalla, endpoint ni
seed para crear/promover/invitar admins**. El rol se asigna con SQL directo
sobre `profiles.rol`.

**Prerequisito:** la persona ya tiene que estar **registrada** (existe su fila
en `profiles`). Esto sólo cambia el `rol`.

**Sentencia (`set_config` en la misma transacción):**

```sql
-- El trigger profiles_guard_nivel_rol_trigger (init_plataforma.sql §5) aborta
-- cualquier UPDATE de nivel/rol salvo auth.role() = 'service_role'. El SQL
-- editor del dashboard corre como `postgres`, no como `service_role`, así que
-- hay que simular ese claim dentro de la misma transacción:
begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles
   set rol = 'admin'
 where email = 'persona@ogcircle.example';   -- email exacto de la cuenta ya registrada
commit;
```

> **Verificado (35-T12) contra el proyecto real (`og-circle`, ref
> `hsmodrhbwkromoixrxrt`, `sa-east-1`) el 2026-09-05:** tras
> `set_config('request.jwt.claims','{"role":"service_role"}', true)`,
> `auth.role()` devuelve `'service_role'`, que es exactamente lo que el guard
> `profiles_guard_nivel_rol()` compara (`auth.role() is distinct from
> 'service_role'` pasa a ser falso → no lanza). El `set_config` con el tercer
> argumento en `true` es local a la transacción, así que el `update` **tiene
> que ir en el mismo `begin; … commit;`**. No hace falta desactivar el trigger.

**Propagación al claim:** no hace falta tocar `app_metadata` a mano — el Auth
Hook (`custom_access_token_hook`) lee `profiles.rol` fresco en cada emisión de
token. El nuevo admin ve el acceso tras **renovar la sesión** (relogin, o
esperar a que expire el access token, ~1 h).

**Quién puede correrla:** alguien con acceso al proyecto Supabase (SQL editor
del dashboard o MCP autorizado con `execute_sql`). No viaja en el repo.

## 9. `middleware.ts` (VGRP-17) — pendiente de prueba end-to-end

`middleware.ts` (raíz del repo) protege las rutas de `(app)` (hoy,
`/dashboard/:path*`) verificando la sesión con `supabase.auth.getClaims()`
y redirigiendo a `/login` si no hay sesión válida. El código sigue el
patrón oficial de `@supabase/ssr` para Middleware de Next.js y se verificó
sólo por lectura — esta máquina no tiene un proyecto Supabase real
vinculado (ver arriba), así que no se pudo probar el flujo completo
(cookies de sesión reales, refresh de token, redirect efectivo) contra un
proyecto vivo. Falta correrlo end-to-end una vez que el proyecto exista y
tenga `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
configuradas (sección 7).
