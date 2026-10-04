# DESCARTADO: cobro por transferencia

El cobro por transferencia con comprobante se canceló el 03/10/2026.

- VGRP-61 (requisitos y diseño de este bloque) se revirtió en VGRP-71.
- VGRP-62 (cuentas de cobro, panel admin) y VGRP-68 (contrato: tablas, tipos y stubs) se revirtieron en VGRP-72 (Bloque 14). La migración que los deshace es `supabase/migrations/20261004120000_sacar_cobro_transferencia.sql`.
- El método de cobro vuelve a ser Mercado Pago.

Estos documentos se conservan como historia; no describen el estado actual del producto.
