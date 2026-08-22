# Setup de Supabase — pasos manuales pendientes

Este repo tiene las migraciones de VGRP-15 escritas a mano en
`supabase/migrations/`, pero nunca se corrieron de verdad: esta máquina no
tiene el Supabase CLI instalado ni el proyecto vinculado. Alguien con el CLI
y acceso al dashboard tiene que hacer esto antes de que el esquema exista de
verdad en algún entorno.

## 1. Instalar el Supabase CLI

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

## 8. Auth Hook y claves asimétricas — VGRP-16, dos pasos que NO son SQL

`supabase/migrations/20260822035925_auth_hook.sql` deja escrita la función
`public.custom_access_token_hook` (con sus grants) que inyecta
`app_metadata.nivel` y `app_metadata.rol` en el JWT. Aplicar esa migración
**no alcanza** — hacen falta dos pasos manuales en el dashboard, ninguno de
los dos expresable como migración SQL:

1. **Registrar el hook**: Authentication → Hooks → "Customize Access Token
   (Custom Claims)" → activar → seleccionar la función
   `public.custom_access_token_hook`. Sin este paso la función existe en la
   base pero Auth nunca la llama, y ningún JWT lleva los claims nuevos.

2. **Migrar a claves de firma asimétricas (ES256)**: Project Settings →
   JWT Keys. Los proyectos de Supabase arrancan con una clave simétrica
   (HS256, un secreto compartido). `lib/auth/server.ts` (VGRP-16) verifica
   el JWT **localmente**, contra las claves públicas del proyecto — eso sólo
   funciona con firma asimétrica. Con HS256 la verificación local requeriría
   distribuir el secreto compartido a cada runtime que verifica, que es
   exactamente lo que se quiere evitar (STACK.md §4).

Orden recomendado: migrar a ES256 primero, confirmar que el login sigue
funcionando, y recién ahí activar el hook — así, si algo sale mal, es más
fácil aislar cuál de los dos cambios lo causó.

Ver `docs/AUTH.md` para el resto del diseño (qué claims exactos, cómo se
resuelve el refresco post-pago, qué expone `lib/auth/`).
