-- =============================================================================
-- VGRP-54 punto 8 (1/2) — Bloque 10 (Rendimiento). Índice faltante en la FK
-- nivel_overrides.actor_id.
-- =============================================================================
-- `nivel_overrides.actor_id uuid references public.profiles (id)`
-- (20260905030100_nivel_overrides.sql) no tiene índice propio — el único
-- índice de la tabla es `nivel_overrides_user_created_idx on (user_id,
-- created_at desc)`, que no cubre `actor_id` como columna líder. Postgres
-- indexa automáticamente la PK referenciada (`profiles.id`), nunca la
-- columna que referencia: todo `DELETE` sobre `profiles` obliga a un seq
-- scan de `nivel_overrides` para chequear la FK. Y `profiles.id` tiene `on
-- delete cascade` desde `auth.users`, así que borrar un usuario de Auth
-- dispara exactamente ese chequeo.
--
-- En commit aparte del drop del índice redundante de `pagos` (mismo punto del
-- ticket) para poder revertir uno sin el otro.
create index if not exists nivel_overrides_actor_id_idx
  on public.nivel_overrides (actor_id);

comment on index public.nivel_overrides_actor_id_idx is
  'VGRP-54 punto 8 — cubre la FK actor_id (referencias a profiles), que no '
  'tenía índice propio. Evita seq scan de esta tabla en cada DELETE de '
  'profiles/auth.users.';
