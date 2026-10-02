# Edge Config — VGRP-39

Configuración mutable de OG Circle (precios, flags y links externos), leída en runtime
desde [Vercel Edge Config](https://vercel.com/docs/storage/edge-config) mediante
`lib/config/index.ts`. Decisión de proyecto: **los precios viven en configuración, nunca
hardcodeados en código de UI.**

## Estado actual

El store **`sistema-og-circle`** (`ecfg_5zkcaib5hisdopluzptaqj81mmq4`) está creado y
vinculado al proyecto de Vercel `sistema-og-circle`. La env var `EDGE_CONFIG` está
seteada en production, preview y development (tipo Config, no Secret), así que
`vercel env pull .env.local` la baja para desarrollo local.

Las cuatro claves (`precios`, `plan`, `flags`, `links`) están cargadas con los valores de
la sección siguiente. `plan` se sumó en VGRP-59/60 (Bloque 13 — plan único): el nombre
comercial del único plan, separado de `precios` porque es copy, no dinero. El módulo
`lib/config/` sigue tolerando la ausencia del store: sin `EDGE_CONFIG` seteada se
comporta como si la lectura hubiera fallado y aplica las reglas de fallback de la tabla
de abajo.

Editar un valor no requiere deploy (se refleja en segundos).

**`precios`, `plan` y `flags` — desde `/admin/config` (VGRP-40, recomendado).** Un admin
logueado puede cambiarlos desde el panel: los precios piden confirmación explícita
(valor anterior → nuevo) antes de guardar, y todo cambio queda en el audit log
(`admin_audit_log`, `entidad = "config"`). Por debajo escribe vía la API REST de Vercel
(`lib/config/write.ts`), que necesita `VERCEL_EDGE_CONFIG_ID` y
`VERCEL_EDGE_CONFIG_WRITE_TOKEN` seteados (ver `.env.example`) — sin esos dos, el panel
muestra el error de guardado en vez de escribir a medias.

**`links` — sólo por CLI, por ahora.** El panel no cubre `links` (no tiene el mismo
perfil de riesgo que el dinero, y cambia con poca frecuencia). Se sigue editando a mano:

```bash
vercel global-config items sistema-og-circle    # ver estado actual del store
vercel global-config update sistema-og-circle --patch \
  '{"items":[{"operation":"update","key":"links","value":{"calculadora":"...","whatsapp":"...","traxcargo":"..."}}]}'
```

La misma CLI sigue sirviendo como vía alternativa para `precios`/`plan`/`flags` si el
panel no está disponible por algún motivo.

## Claves

| Clave | Tipo | Qué controla | Si falla la lectura o la validación |
|---|---|---|---|
| `precios.plan` | `number` (entero positivo, ARS) | Precio del único plan (VGRP-59/60, Bloque 13 — antes dos claves, `precios.principiante`/`precios.avanzado`) | **Sin fallback.** `getPrecios()` devuelve `{ ok: false, error }`. El caller debe deshabilitar el checkout — nunca se muestra ni se cobra un número adivinado. |
| `plan.nombre` | `string` (no vacío) | Nombre comercial del único plan (hoy "Plan X") | Fail-open: default hardcodeado en `lib/config/index.ts` (`DEFAULT_PLAN`) — es copy, no dinero. |
| `flags.checkout_habilitado` | `boolean` | **Hoy no controla nada** (ningún código lo lee) | Default conservador: `false`. |
| `flags.mercadopago_habilitado` | `boolean`, opcional (VGRP-61) | Si se puede iniciar un pago con Mercado Pago (`crearCheckout` y el botón de `/comprar`). No afecta al webhook. | Default conservador: `false` (MP apagado). Si la clave falta, también vale `false`, sin invalidar el resto de `flags`. |
| `flags.registro_habilitado` | `boolean` | Si el registro de usuarios está activo | Default conservador: `false` (registro apagado). |
| `flags.fase` | `"1" \| "2" \| "3" \| "4"` | Fase actual del proyecto | Default conservador: `"2"`. |
| `links.calculadora` | `string` (URL) | Link externo a la calculadora | Default hardcodeado en `lib/config/index.ts` (un link viejo no cuesta plata). |
| `links.whatsapp` | `string` (URL) | Link externo de contacto por WhatsApp | Default hardcodeado en `lib/config/index.ts`. |
| `links.traxcargo` | `string` (URL) | Link externo a Traxcargo | Default hardcodeado en `lib/config/index.ts`. |

**Nunca agregar una clave de descuento, early-adopter o porcentaje promocional.** No hay
descuentos en esta fase del proyecto; si esto cambia, tiene que ser una decisión
explícita registrada antes de tocar el schema.

## Valores cargados (PRD Fase 2 §1.1)

Estado actual del store `sistema-og-circle`:

```json
{
  "precios": {
    "plan": 90000
  },
  "plan": {
    "nombre": "Plan X"
  },
  "flags": {
    "checkout_habilitado": false,
    "registro_habilitado": true,
    "fase": "2"
  },
  "links": {
    "calculadora": "https://vegroup.vercel.app/calculadora",
    "whatsapp": "https://wa.me/5491100000000",
    "traxcargo": "https://traxcargo.com"
  }
}
```

Notas sobre los valores:

- `flags.checkout_habilitado` está en `false`, pero hoy ningún código lo lee: no controla
  nada (aclarado en VGRP-61; darle una función queda para otro ticket).
- `flags.mercadopago_habilitado` todavía no está cargado, así que vale `false` (MP apagado,
  VGRP-61). Se escribe la primera vez que un admin guarda los flags desde `/admin/config`.
- `links.whatsapp` sigue siendo el placeholder `5491100000000` (mismo valor que el
  fallback de `lib/config/index.ts`). Reemplazar por el número real de soporte cuando
  esté definido.

## Reactivar Mercado Pago (VGRP-61)

Desde el 02/10/2026 el cobro es por transferencia y Mercado Pago está apagado con
`flags.mercadopago_habilitado = false`. El código de la integración (checkout, webhook,
firma, mapeo de estados y sus tests) sigue en el repo y en verde.

- **Qué apaga el flag:** sólo el inicio de pagos. `crearCheckout()` devuelve error sin
  hablar con MP, y `/comprar` no muestra el botón ni nombra a MP.
- **Qué NO apaga:** el webhook `/api/webhooks/mercadopago` sigue activo, para no perder
  pagos tardíos ni refunds de checkouts iniciados antes del apagado.

Para reactivarlo:

1. Verificar que `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` estén cargadas
   en Vercel para el entorno que corresponda (ver `docs/MERCADOPAGO-PRODUCCION.md`).
2. En `/admin/config`, prender "Mercado Pago habilitado" y guardar. No hace falta deploy.
3. Probar un checkout en `/comprar`.

Para apagarlo de nuevo, destildar el mismo checkbox.

## Diseño: fail closed en dinero, fail open en cosmético

Documentado en detalle como comentario en `lib/config/index.ts`. Resumen:

- **Dinero (`precios`)**: fail **closed**. Sin fallback hardcodeado. Si la lectura o la
  validación fallan, `getPrecios()` (y por lo tanto `getConfig()`) señala el error
  explícitamente para que el caller pueda apagar el checkout.
- **Flags**: fail **open** hacia el lado conservador — todo apagado por default si falla
  la lectura.
- **Links**: fail **open** — default hardcodeado razonable, porque un link viejo no
  genera pérdida de plata.

## Pendiente

La landing y las pantallas de precios/checkout todavía no existen en este repo (más allá
del dashboard placeholder). Cuando se construyan en bloques posteriores, tienen que leer
los precios y links a través de `lib/config/`, nunca hardcodeados en el componente. Este
ticket (VGRP-39) no crea esas pantallas — solo el módulo de configuración.
