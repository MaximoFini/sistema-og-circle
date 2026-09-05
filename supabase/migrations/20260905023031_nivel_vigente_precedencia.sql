-- =============================================================================
-- VGRP-24 — Corrige nivel_vigente(): precedencia por nivel, no por recencia
-- =============================================================================
-- La versión original (20260822035923_init_plataforma.sql) resolvía el nivel
-- vigente tomando el pago aprobado (no reembolsado) MÁS RECIENTE por
-- created_at. Eso contradice un criterio de aceptación explícito de VGRP-24:
--
--   "Un usuario con un pago de Principiante y otro de Avanzado queda en
--    Avanzado, no en el último cronológico."
--
-- Con la lógica anterior, alguien que compra Avanzado y después —por lo que
-- sea— vuelve a comprar Principiante quedaba degradado a Principiante. Eso
-- nunca puede pasar: los niveles no vencen ni se pisan entre sí, sólo se
-- reembolsan (y el reembolso ya está cubierto por el filtro de `refunded`
-- que esta migración no toca).
--
-- Fix: ordenar por nivel_comprado en vez de por created_at. Es válido porque
-- el enum nivel_acceso se declaró en orden de precedencia real:
--
--   create type public.nivel_acceso as enum ('ninguno', 'principiante', 'avanzado');
--
-- Postgres compara enums por su posición de declaración, así que
-- 'avanzado' > 'principiante' > 'ninguno' ya es cierto sin necesidad de un
-- CASE ni de una tabla de pesos aparte. Si en el futuro se agrega un tercer
-- nivel intermedio, tiene que declararse en la posición correcta del enum
-- (ALTER TYPE ... ADD VALUE ... BEFORE/AFTER) para que este ORDER BY siga
-- siendo válido — no hace falta tocar esta función.
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
      order by p.nivel_comprado desc
      limit 1
    ),
    'ninguno'::public.nivel_acceso
  );
$$;

comment on function public.nivel_vigente(uuid) is
  'Deriva el nivel de acceso vigente de un usuario a partir del ledger de '
  'pagos: el nivel MÁS ALTO entre los pagos approved sin un refunded '
  'posterior para el mismo proveedor_ref (nunca el más reciente '
  'cronológicamente — ver VGRP-24 y el comentario extenso de esta migración). '
  'Válido porque nivel_acceso está declarado en orden de precedencia.';
