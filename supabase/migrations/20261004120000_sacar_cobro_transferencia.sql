-- VGRP-72 / Bloque 14 — sacar el cobro por transferencia.
--
-- Se cancela el cobro por transferencia con comprobante (decidido el 02/10/2026
-- en VGRP-61 y cancelado el 03/10/2026). VGRP-61 se revierte en VGRP-71 y
-- VGRP-62 / VGRP-68 se revierten en VGRP-72. El método de cobro vuelve a ser
-- Mercado Pago.
--
-- Esta migración borra lo que quedó del bloque 13:
--   1. la función activar_cuenta_cobro(uuid)
--   2. la tabla comprobantes_transferencia (referencia cuentas_cobro)
--   3. la tabla cuentas_cobro
--
-- Sin CASCADE a propósito: si algo más depende de estos objetos, el drop falla
-- y no se pierde nada en silencio. Las migraciones 20261003120000 y
-- 20261003180000 se dejan tal cual, como historia.

drop function if exists public.activar_cuenta_cobro(uuid);

drop table public.comprobantes_transferencia;

drop table public.cuentas_cobro;
