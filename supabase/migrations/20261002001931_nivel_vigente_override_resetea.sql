-- =============================================================================
-- Hallazgo de auditoría (no un ticket) — nivel_vigente() v4: el override
-- resetea el historial de pagos, en vez de competir por antigüedad contra el
-- pago de MAYOR nivel del ledger.
-- =============================================================================
--
-- v3 (20260905030100_nivel_overrides.sql) comparaba el override más reciente
-- contra el created_at del pago de MAYOR NIVEL del ledger (no contra el pago
-- más reciente cronológicamente). Eso producía un caso de negocio real y
-- sorprendente, encontrado auditando la matriz de precedencia a mano (no en
-- producción):
--
--   pago approved 'avanzado' (t0)
--   -> override 'ninguno' (t1, un admin revoca el acceso)
--   -> pago approved 'principiante' (t2, el usuario vuelve a pagar)
--
--   v3 devolvía 'ninguno': el override (t1) seguía "ganando" porque la única
--   fecha contra la que se comparaba era la del pago de MAYOR nivel del
--   ledger (avanzado, t0), y t1 > t0. El pago nuevo de t2 nunca entraba en la
--   comparación. Resultado: alguien a quien se le revocó el acceso, y que
--   después vuelve a pagar, queda SIN acceso pese al pago nuevo — sin que
--   nada en el panel lo marque como anómalo salvo revisar el ledger a mano.
--
-- v4 cambia la semántica del override: deja de ser "un valor que compite por
-- antigüedad contra el pago más caro del historial completo", y pasa a ser un
-- RESET — el override más reciente borra todo pago ANTERIOR a su propio
-- instante y es el piso de acceso desde ahí en adelante. Desde ese instante,
-- los pagos vuelven a acumularse con la regla de siempre (VGRP-24: gana el
-- de mayor nivel entre los pagos considerados, nunca el más reciente
-- cronológicamente) — sólo que el conjunto de pagos considerados ahora son
-- los posteriores (o simultáneos) al último override, no el ledger entero.
-- Sin ningún override, el comportamiento es idéntico a v2/v3 (todo el ledger
-- cuenta, gana el de mayor nivel).
--
-- Los 6 escenarios de la matriz de precedencia (auditados a mano contra la
-- base real con un script, no en CI, antes de aplicar esta migración) y lo
-- que esta función tiene que seguir devolviendo:
--
--   a) override 'principiante' (t0) -> pago 'avanzado' (t1)
--        -> avanzado   (el pago posterior al override gana, es mayor nivel)
--   b) pago 'avanzado' (t0) -> override 'ninguno' (t1)
--        -> ninguno    (el override resetea el pago anterior)
--   c) pago 'avanzado' (t0) -> override 'ninguno' (t1) -> pago 'principiante' (t2)
--        -> principiante   (ERA 'ninguno' en v3 — este es el fix: el pago
--                            posterior al override cuenta, ya no queda
--                            enterrado detrás de un pago viejo de mayor nivel)
--   d) pago 'avanzado' (t0) -> override 'principiante' (t1) -> refund de t0 (mismo proveedor_ref)
--        -> principiante   (t0 es anterior al override, no cuenta de todos modos)
--   e) override 'avanzado' (t0) -> pago 'principiante' (t1) -> refund de ese mismo pago (t2)
--        -> avanzado   (el único pago posterior al override quedó refunded,
--                        no cuenta; gana el piso del override)
--   f) override 'avanzado' (t0) -> override 'ninguno' (t1)
--        -> ninguno    (gana el override más reciente entre sí mismos)
-- =============================================================================
create or replace function public.nivel_vigente(p_user_id uuid)
returns public.nivel_acceso
language sql
stable
set search_path = ''
as $$
  with ultimo_override as (
    select nivel, created_at as at
    from public.nivel_overrides
    where user_id = p_user_id
    order by created_at desc
    limit 1
  ),
  pagos_relevantes as (
    -- Sólo los pagos approved, sin un refunded posterior para el mismo
    -- proveedor_ref (igual criterio que siempre), y con created_at posterior
    -- o igual al último override (o todo el ledger, si no hay ningún
    -- override) — el override resetea lo anterior a su propio instante.
    select p.nivel_comprado as nivel
    from public.pagos p
    where p.user_id = p_user_id
      and p.estado = 'approved'
      and p.created_at >= coalesce(
        (select o.at from ultimo_override o),
        '-infinity'::timestamptz
      )
      and not exists (
        select 1
        from public.pagos r
        where r.proveedor_ref = p.proveedor_ref
          and r.estado = 'refunded'
      )
  )
  -- Postgres compara enums por su posición de declaración (ver el comentario
  -- de 20260905023031_nivel_vigente_precedencia.sql), así que GREATEST()
  -- entre el override (piso) y el mejor pago posterior es exactamente "gana
  -- el mayor nivel entre los dos", sin CASE ni tabla de pesos.
  select greatest(
    coalesce((select o.nivel from ultimo_override o), 'ninguno'::public.nivel_acceso),
    coalesce((select max(nivel) from pagos_relevantes), 'ninguno'::public.nivel_acceso)
  );
$$;

comment on function public.nivel_vigente(uuid) is
  'v4 — el nivel vigente es el MAYOR entre el override más reciente (piso, o '
  '''ninguno'' si nunca hubo uno) y el mejor pago approved sin reembolso con '
  'created_at posterior o igual a ese mismo override (o de todo el ledger, '
  'si no hay override). Un override resetea el historial de pagos anterior a '
  'su propio instante; los pagos posteriores vuelven a acumularse con la '
  'regla de siempre (VGRP-24: gana el de mayor nivel, nunca el más reciente '
  'cronológicamente). Ver el comentario extenso de esta migración '
  '(20261002001931_nivel_vigente_override_resetea.sql) para los 6 casos de '
  'la matriz de precedencia y el bug de negocio que corrige frente a v3 '
  '(20260905030100_nivel_overrides.sql): un usuario al que se le revocó el '
  'acceso y que vuelve a pagar podía quedar sin acceso pese al pago nuevo.';
