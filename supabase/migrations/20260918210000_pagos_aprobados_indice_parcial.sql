-- =============================================================================
-- VGRP-54 punto 7 — Bloque 10 (Rendimiento). Índice parcial pagos(user_id)
-- where estado = 'approved'.
-- =============================================================================
-- Escrita a mano, siguiendo el criterio de las migraciones previas de este
-- repo — NO se aplicó todavía con `apply_migration` desde esta sesión: el
-- proyecto real de og-circle (ref hsmodrhbwkromoixrxrt, docs/SUPABASE-SETUP.md)
-- no está entre los proyectos visibles por el MCP de Supabase conectado acá
-- (cada dev loguea su propia cuenta, ver CLAUDE.md). Quien la aplique tiene
-- que correr el EXPLAIN ANALYZE de antes/después que pide el criterio de
-- aceptación del punto 7 y pegarlo en el ticket — no se puede dar por medido
-- sólo por este comentario.
--
-- POR QUÉ este índice (dos consumidores reales, no uno):
--
-- 1. `nivel_vigente(p_user_id)` (20260905023031_nivel_vigente_precedencia.sql)
--    filtra exactamente `where p.user_id = p_user_id and p.estado = 'approved'`
--    antes de evaluar el anti-join de refunds. Sin este índice, Postgres tiene
--    que recorrer TODAS las filas de `pagos` de ese usuario (aprobadas o no)
--    para encontrar las aprobadas. Esta función corre en cada
--    `proyectarNivel()` — el webhook de Mercado Pago y el reproceso manual de
--    admin (VGRP-54 punto 6, mismo bloque).
--
-- 2. `admin_pagos_ledger.sin_aplicar` (20260905030200_admin_pagos_ledger.sql)
--    empieza con el mismo conjunto `p.estado = 'approved' and not exists (...)`.
--    `contarPagosSinAplicar()` hace `count(*) where sin_aplicar = true` sobre
--    la vista ENTERA: como Postgres expande la vista para evaluar ese filtro,
--    el índice parcial deja podar de entrada las filas no-aprobadas (que en
--    este dominio son la mayoría — pending/rejected/refunded) antes de pagar
--    las dos subconsultas correlacionadas por cada una. No elimina el costo
--    de las subconsultas en las filas aprobadas que quedan, pero reduce
--    cuántas filas las pagan.
--
-- No reemplaza ningún índice existente: `pagos_created_at_idx` (misma
-- migración de la vista) es por `created_at desc, id desc` para el keyset del
-- listado; `pagos_proveedor_ref_idx` (init_plataforma.sql) es por
-- `proveedor_ref`, que ya sirve al anti-join de refunds del propio
-- `nivel_vigente()` y de la vista. Este es el único que faltaba para el par
-- (user_id, estado='approved').
create index if not exists pagos_user_id_approved_idx
  on public.pagos (user_id)
  where estado = 'approved';

comment on index public.pagos_user_id_approved_idx is
  'VGRP-54 punto 7 — sirve el filtro exacto de nivel_vigente() (user_id + '
  'estado=approved) y poda filas no-aprobadas antes de las dos subconsultas '
  'correlacionadas de admin_pagos_ledger.sin_aplicar. Verificar con '
  'pg_stat_user_indexes tras un tiempo en uso.';
