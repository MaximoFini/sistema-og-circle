-- =============================================================================
-- VGRP-15 — Esquema de base de datos y RLS (profiles, pagos, admin_audit_log)
-- =============================================================================
-- Escrita a mano porque esta máquina no tiene el Supabase CLI instalado ni el
-- proyecto vinculado. No fue posible correr `supabase db reset` ni validar
-- este SQL ejecutándolo de verdad — fue revisado línea por línea contra los
-- criterios de aceptación del ticket. Antes de aplicarla en un proyecto real:
--   1. `supabase link` al proyecto correcto (confirmar región sa-east-1).
--   2. `supabase db push` (o `supabase db reset` en local primero).
--   3. Confirmar que corrió sin errores y que las policies quedaron activas
--      (`select * from pg_policies where schemaname = 'public';`).
-- Ver docs/SUPABASE-SETUP.md para el resto de los pasos manuales pendientes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------

create type public.nivel_acceso as enum ('ninguno', 'principiante', 'avanzado');
create type public.rol_usuario as enum ('user', 'admin');

-- -----------------------------------------------------------------------------
-- 2. TABLAS
-- -----------------------------------------------------------------------------

-- profiles: una fila por usuario, creada automáticamente por trigger sobre
-- auth.users (ver sección 4). No se inserta desde el cliente nunca.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text,
  telefono text,
  nivel public.nivel_acceso not null default 'ninguno',
  rol public.rol_usuario not null default 'user',
  progreso jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Una fila por usuario. nivel y rol NO son modificables por el propio usuario: '
  'ver grants por columna y el trigger de resguardo más abajo.';

-- pagos: ledger append-only. Fuente de verdad de por qué un usuario tiene el
-- nivel que tiene. Nunca se hace UPDATE ni DELETE sobre una fila existente:
-- cada transición de estado de un pago (pending -> approved -> refunded, etc.)
-- es una fila nueva.
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  proveedor text not null,
  proveedor_ref text not null,
  nivel_comprado public.nivel_acceso not null,
  monto_ars numeric not null,
  estado text not null,
  payload_raw jsonb not null,
  created_at timestamptz not null default now(),
  -- DECISIÓN: UNIQUE(proveedor_ref, estado) y NO UNIQUE(proveedor_ref) sola.
  -- El PRD original pedía UNIQUE(proveedor_ref) a secas, pero eso no cierra
  -- con un ledger append-only: un mismo pago de MercadoPago pasa por varios
  -- estados ('pending' -> 'approved', o 'approved' -> 'refunded'), y cada
  -- transición necesita su propia fila para que el historial quede completo.
  -- UNIQUE(proveedor_ref, estado) preserva el append-only real (una fila por
  -- transición) y sigue siendo idempotente: si el webhook de MercadoPago
  -- reenvía el mismo evento 5 veces, las 5 inserciones para el mismo
  -- (proveedor_ref, estado) chocan contra esta constraint y sólo la primera
  -- persiste. El patrón de inserción para el futuro webhook (VGRP-16 o
  -- posterior) es:
  --   insert into public.pagos (...)
  --   values (...)
  --   on conflict (proveedor_ref, estado) do nothing;
  constraint pagos_proveedor_ref_estado_key unique (proveedor_ref, estado)
);

comment on table public.pagos is
  'Ledger append-only de pagos. No se hace UPDATE ni DELETE nunca: cada '
  'transición de estado de un pago es una fila nueva. Constraint UNIQUE '
  '(proveedor_ref, estado) para idempotencia del webhook — ver comentario '
  'en la definición de la tabla.';

create index pagos_user_id_idx on public.pagos (user_id);
create index pagos_proveedor_ref_idx on public.pagos (proveedor_ref);

-- admin_audit_log: obligatoria desde el día uno porque el panel de admin
-- puede regalar acceso pago (cambiar nivel/rol de un usuario a mano). Toda
-- acción de admin sobre profiles (u otra entidad sensible) debe loguearse acá.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  accion text not null,
  entidad text not null,
  entidad_id text,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Auditoría de acciones de admin. Sólo escribible por service_role (el '
  'backend registra la acción explícitamente, no hay trigger automático '
  'todavía). Legible sólo por usuarios con rol=admin en su JWT.';

-- -----------------------------------------------------------------------------
-- 3. nivel_vigente(): deriva el nivel de acceso vigente de un usuario a partir
--    del ledger de pagos.
-- -----------------------------------------------------------------------------
--
-- Lógica elegida (simple y correcta, no la más "elegante" posible):
--   1. Mirar todas las filas de pagos de ese user_id con estado = 'approved'.
--   2. De esas, descartar cualquiera cuyo proveedor_ref tenga TAMBIÉN una fila
--      con estado = 'refunded' (en cualquier momento, sin importar el orden
--      temporal relativo a la fila 'approved' — un reembolso siempre anula la
--      compra que reembolsa, independientemente de cuándo se procesó cada
--      fila en nuestra base).
--   3. De las que sobreviven, tomar la más reciente por created_at y devolver
--      su nivel_comprado.
--   4. Si no queda ninguna, devolver 'ninguno'.
--
-- Nota: NO se marca security definer. Corre con los privilegios del rol que
-- llama a la función, así que respeta RLS de pagos (un usuario autenticado
-- sólo puede derivar su propio nivel, porque sólo puede leer sus propias
-- filas de pagos). Si en el futuro un proceso de servidor necesita derivar el
-- nivel de otro usuario (ej. un admin, o el auth hook de VGRP-16), debe
-- llamarla con una conexión de service_role (que bypasea RLS), no convertir
-- esta función en security definer.
create or replace function public.nivel_vigente(p_user_id uuid)
returns public.nivel_acceso
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select p.nivel_comprado
      from public.pagos p
      where p.user_id = p_user_id
        and p.estado = 'approved'
        and not exists (
          select 1
          from public.pagos r
          where r.proveedor_ref = p.proveedor_ref
            and r.estado = 'refunded'
        )
      order by p.created_at desc
      limit 1
    ),
    'ninguno'::public.nivel_acceso
  );
$$;

comment on function public.nivel_vigente(uuid) is
  'Deriva el nivel de acceso vigente de un usuario a partir del ledger de '
  'pagos: última fila approved sin un refunded posterior para el mismo '
  'proveedor_ref. Ver comentario extenso arriba de la definición.';

-- -----------------------------------------------------------------------------
-- 4. Trigger auth.users -> public.profiles
-- -----------------------------------------------------------------------------
--
-- security definer + set search_path = '' + referencias de esquema completo
-- (public.profiles, auth.users) NO son opcionales acá:
--   - security definer: el trigger corre en el contexto de auth.users, que el
--     rol authenticated no puede escribir directamente (profiles sí, via RLS,
--     pero este insert necesita escribir nivel/rol con sus defaults, cosa que
--     el propio grant por columna del usuario no permite). Sin definer, el
--     insert a public.profiles falla en silencio o con error de permisos y el
--     usuario queda sin fila en profiles.
--   - set search_path = '': una función security definer hereda los
--     privilegios del owner (normalmente postgres/supabase_admin). Si no se
--     fija el search_path, alguien podría crear un objeto (tabla, función)
--     con el mismo nombre en un esquema que sí esté en el search_path del
--     usuario que dispara el trigger, y la función terminaría operando sobre
--     ese objeto malicioso en vez de la tabla real (search_path hijacking).
--     Por eso, además, cada referencia va con esquema completo
--     (public.profiles, auth.users) y no confía en ningún search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea la fila de profiles al registrarse un usuario. security definer + '
  'search_path vacío + referencias con esquema completo son necesarios: ver '
  'comentario arriba de la definición. No "simplificar" quitando esto.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. Trigger de resguardo: nadie (salvo service_role) puede cambiar
--    profiles.nivel ni profiles.rol, ni siquiera si se saltea los grants por
--    columna de alguna forma (algunos clientes/drivers no respetan grants
--    por columna de la misma manera). Cinturón y tiradores.
-- -----------------------------------------------------------------------------
create or replace function public.profiles_guard_nivel_rol()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.nivel is distinct from old.nivel or new.rol is distinct from old.rol)
     and auth.role() is distinct from 'service_role' then
    raise exception 'No autorizado: nivel y rol no se pueden modificar directamente';
  end if;
  return new;
end;
$$;

comment on function public.profiles_guard_nivel_rol() is
  'Aborta cualquier UPDATE que cambie nivel o rol si quien ejecuta no es '
  'service_role. Es la segunda capa de defensa además de los grants por '
  'columna (revoke update + grant update de columnas puntuales) más abajo — '
  'no depender de una sola de las dos.';

create trigger profiles_guard_nivel_rol_trigger
  before update on public.profiles
  for each row execute function public.profiles_guard_nivel_rol();

-- -----------------------------------------------------------------------------
-- 6. Grants por columna / tabla
-- -----------------------------------------------------------------------------
-- RLS no restringe columnas, sólo filas: una policy de UPDATE autoriza la
-- fila entera. Por eso el criterio "un usuario no puede modificar su propio
-- nivel ni rol" se implementa acá con grants por columna, no con una policy.

-- profiles: sólo SELECT de su fila (via policy) + UPDATE de columnas no
-- sensibles. Nada de INSERT/DELETE desde el cliente (la fila la crea el
-- trigger de auth.users, y no se borra profiles directamente — se borra en
-- cascada si se borra el auth.users correspondiente).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nombre, telefono, progreso) on public.profiles to authenticated;

-- pagos: sólo lectura de las propias filas. Nunca INSERT/UPDATE/DELETE desde
-- el cliente — los pagos los escribe el webhook de MercadoPago via
-- service_role.
revoke all on public.pagos from anon, authenticated;
grant select on public.pagos to authenticated;

-- admin_audit_log: sólo lectura, y sólo si la policy de abajo confirma
-- rol=admin en el JWT. Nunca escritura desde el cliente — la escribe el
-- backend con service_role cuando un admin hace una acción.
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- service_role ya bypasea RLS por defecto en Supabase (tiene BYPASSRLS), y
-- normalmente ya tiene grants completos por los defaults del proyecto. Estos
-- grants son explícitos igual, por claridad y para no depender de un default
-- de plataforma que podría cambiar.
grant all on public.profiles to service_role;
grant all on public.pagos to service_role;
grant all on public.admin_audit_log to service_role;
grant execute on function public.nivel_vigente(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Row Level Security
-- -----------------------------------------------------------------------------
-- Regla en todas las policies de acá abajo: (select auth.jwt()) y
-- (select auth.uid()) siempre envueltos en un subselect, para que Postgres
-- los evalúe UNA vez por query (como un valor estable) y no una vez por fila
-- evaluada — es la optimización de RLS recomendada por Supabase. Ninguna
-- policy hace una subquery a public.profiles para leer nivel/rol: ese dato
-- se lee directo del JWT (app_metadata), no de la tabla.

alter table public.profiles enable row level security;
alter table public.pagos enable row level security;
alter table public.admin_audit_log enable row level security;

-- profiles: cada usuario ve y actualiza sólo su propia fila (el UPDATE real
-- de columnas sensibles ya está bloqueado por los grants de la sección 6 y
-- por el trigger de la sección 5; esta policy sólo controla la fila).
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ( id = (select auth.uid()) );

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ( id = (select auth.uid()) )
with check ( id = (select auth.uid()) );

-- pagos: cada usuario ve sólo sus propias filas. No hay policy de
-- insert/update/delete para authenticated -> esas operaciones quedan
-- denegadas por RLS incluso si algún día se otorgara el grant por error.
create policy "pagos_select_own"
on public.pagos
for select
to authenticated
using ( user_id = (select auth.uid()) );

-- admin_audit_log: sólo visible para quien tenga rol=admin en su JWT
-- (app_metadata.rol, seteado por el auth hook de VGRP-16 — todavía no
-- implementado en este ticket). Hasta que ese hook exista, ningún usuario
-- autenticado va a tener ese claim y esta policy no deja pasar a nadie salvo
-- service_role, que bypasea RLS.
create policy "admin_audit_log_select_admin"
on public.admin_audit_log
for select
to authenticated
using ( ((select auth.jwt()) -> 'app_metadata' ->> 'rol') = 'admin' );
