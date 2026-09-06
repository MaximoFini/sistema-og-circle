-- =============================================================================
-- VGRP-37 / Bloque 5 — Vista `admin_pagos_ledger` + índice `pagos_created_at_idx`
-- =============================================================================
-- Escrita a mano siguiendo el mismo criterio que las migraciones previas de
-- este repo (20260822035923_init_plataforma.sql, 20260905030100_nivel_overrides.sql,
-- 20260906023048_admin_audit_log_indices). Revisada línea por línea contra
-- design.md §"VGRP-37 — vista `admin_pagos_ledger`".
--
-- APLICADA el 2026-09-06 con `apply_migration` (MCP de Supabase) en el proyecto
-- real (og-circle, ref hsmodrhbwkromoixrxrt, región sa-east-1 — ver
-- docs/SUPABASE-SETUP.md). `lib/database.types.ts` se regeneró después con
-- `generate_typescript_types` (suma la vista `admin_pagos_ledger` a
-- `Database["public"]["Views"]`).
--
-- `get_advisors` (security + performance) corrido el 2026-09-06 después de
-- aplicar: la vista `admin_pagos_ledger` NO dispara NINGÚN advisor (ni
-- `security_definer_view` ni ningún otro) — justamente porque se declara
-- `security_invoker = true` y, además, se consulta SÓLO por service role (el
-- panel; ver design.md §"Sanitización de acceso admin en la capa de datos") y
-- NO se expone a `anon`/`authenticated`, así que no hay fuga de RLS. El único
-- hallazgo nuevo por esta migración es `unused_index` (INFO) sobre
-- `pagos_created_at_idx`, esperado: sin tráfico todavía. Ninguno es bloqueante.
-- Ver el cuerpo de la PR de VGRP-37 para el detalle completo.
-- =============================================================================
--
-- POR QUÉ ESTA VISTA (design.md §"Detección de pago aprobado sin nivel
-- aplicado"): US-5 pide RESALTAR — sin que el admin filtre — los pagos
-- `approved` cuyo nivel no quedó reflejado en el perfil del usuario. Resolverlo
-- en la base (columna calculada `sin_aplicar`) permite componer con los
-- filtros/keyset de supabase-js (`.eq().ilike().order().limit()`) y contar el
-- total (`totalSinAplicar`) sin traer todo a memoria.
--
-- `sin_aplicar` = el pago está `approved`, NO tiene un `refunded` para su
-- `proveedor_ref`, y lo que compró es MÁS ALTO que el nivel actual del perfil.
-- La comparación por `>` sobre el enum `nivel_acceso` (declarado en orden de
-- precedencia: `avanzado` > `principiante` > `ninguno`) es lo que hace correcto
-- el caso "compró Principiante y después Avanzado": la fila de Principiante
-- nunca se marca porque `principiante > avanzado` es falso — sólo se marca lo
-- genuinamente no aplicado.
--
-- `payload_raw` NO va en la vista: es JSON crudo y pesado, sólo se muestra en
-- el detalle de un pago y filtrado (`sanitizarPayloadRaw`, lib/data/admin/pagos.ts).
-- Dejarlo afuera también mantiene liviano cada row del listado.
--
-- DOS DECISIONES DELIBERADAS (idénticas a las de `nivel_vigente()` — la vista NO
-- reimplementa esa lógica, la refleja para el badge):
--  1. El anti-join de refunds correlaciona sólo por `proveedor_ref` (+ estado),
--     igual que `nivel_vigente()`. `proveedor_ref` es el id del pago de Mercado
--     Pago y es único (constraint `pagos_proveedor_ref_estado_key`); hoy hay un
--     único `proveedor` ('mercadopago'). Si algún día entra un segundo proveedor
--     con su propio espacio de refs, hay que sumar `and r.proveedor = p.proveedor`
--     acá Y en `nivel_vigente()`.
--  2. `pr.nivel` (no un `nivel_vigente()` fresco) es el nivel YA MATERIALIZADO
--     por la última proyección — lo mismo que ve el claim y el gating. Un
--     override manual que bajó el nivel a propósito puede dejar un pago approved
--     de nivel más alto marcado `sin_aplicar` de forma persistente; es un
--     compromiso conocido (design.md §"Detección…") y aceptable: el badge es una
--     señal para que el admin mire, no una acción automática.

create view public.admin_pagos_ledger
with (security_invoker = true)
as
select
  p.id,
  p.user_id,
  p.proveedor,
  p.proveedor_ref,
  p.nivel_comprado,
  p.monto_ars,
  p.estado,
  p.created_at,
  pr.email as user_email,
  pr.nivel as user_nivel_actual,
  (
    p.estado = 'approved'
    and not exists (
      select 1 from public.pagos r
      where r.proveedor_ref = p.proveedor_ref and r.estado = 'refunded'
    )
    and p.nivel_comprado > pr.nivel
  ) as sin_aplicar
from public.pagos p
join public.profiles pr on pr.id = p.user_id;

comment on view public.admin_pagos_ledger is
  'Ledger de pagos para el panel de admin (VGRP-37). Une pagos + profiles y '
  'calcula `sin_aplicar` (pago approved, sin refunded para su proveedor_ref, '
  'con nivel_comprado > nivel actual del perfil). Se consulta SÓLO por service '
  'role; security_invoker = true, sin grants a anon/authenticated.';

-- La vista se consulta por service role (BYPASSRLS); no se expone a los roles
-- de cliente. `revoke` explícito por si algún grant por defecto de `PUBLIC`
-- alcanzara la vista al crearse.
revoke all on public.admin_pagos_ledger from anon, authenticated;
grant select on public.admin_pagos_ledger to service_role;

-- ---------------------------------------------------------------------------
-- Índice para el orden global del ledger (`order by created_at desc, id desc`,
-- keyset). `id` como desempate estable del cursor — dos pagos con el mismo
-- `created_at` al microsegundo tienen que ordenarse determinísticamente para
-- que el keyset no saltee ni repita filas. `pagos_proveedor_ref_idx` ya existe
-- (init_plataforma.sql) → la búsqueda por `proveedor_ref` no necesita índice
-- nuevo. Sin `concurrently`: `apply_migration` corre en transacción.
create index if not exists pagos_created_at_idx
  on public.pagos (created_at desc, id desc);
