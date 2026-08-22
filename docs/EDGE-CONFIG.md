# Edge Config — VGRP-39

Configuración mutable de OG Circle (precios, flags y links externos), leída en runtime
desde [Vercel Edge Config](https://vercel.com/docs/storage/edge-config) mediante
`lib/config/index.ts`. Decisión de proyecto: **los precios viven en configuración, nunca
hardcodeados en código de UI.**

## Estado actual

Todavía no existe un Edge Config store vinculado en el dashboard de Vercel (nadie con
acceso lo creó aún). El módulo `lib/config/` funciona igual sin él: en desarrollo local,
sin la env var `EDGE_CONFIG` seteada, se comporta como si la lectura hubiera fallado y
aplica las reglas de la tabla de abajo. Cuando alguien con acceso al dashboard cree el
store, hay que:

1. Vincularlo al proyecto de Vercel (esto setea `EDGE_CONFIG` automáticamente).
2. Cargar a mano las tres claves (`precios`, `flags`, `links`) con los valores
   recomendados de la sección siguiente.

## Claves

| Clave | Tipo | Qué controla | Si falla la lectura o la validación |
|---|---|---|---|
| `precios.principiante` | `number` (entero positivo, ARS) | Precio del plan Principiante | **Sin fallback.** `getPrecios()` devuelve `{ ok: false, error }`. El caller debe deshabilitar el checkout — nunca se muestra ni se cobra un número adivinado. |
| `precios.avanzado` | `number` (entero positivo, ARS) | Precio del plan Avanzado | Igual que arriba — `getPrecios()` señala el fallo, sin fallback. |
| `flags.checkout_habilitado` | `boolean` | Si el checkout está activo | Default conservador: `false` (checkout apagado). |
| `flags.registro_habilitado` | `boolean` | Si el registro de usuarios está activo | Default conservador: `false` (registro apagado). |
| `flags.fase` | `"1" \| "2" \| "3" \| "4"` | Fase actual del proyecto | Default conservador: `"2"`. |
| `links.calculadora` | `string` (URL) | Link externo a la calculadora | Default hardcodeado en `lib/config/index.ts` (un link viejo no cuesta plata). |
| `links.whatsapp` | `string` (URL) | Link externo de contacto por WhatsApp | Default hardcodeado en `lib/config/index.ts`. |
| `links.traxcargo` | `string` (URL) | Link externo a Traxcargo | Default hardcodeado en `lib/config/index.ts`. |

**Nunca agregar una clave de descuento, early-adopter o porcentaje promocional.** No hay
descuentos en esta fase del proyecto; si esto cambia, tiene que ser una decisión
explícita registrada antes de tocar el schema.

## Valores iniciales recomendados (PRD Fase 2 §1.1)

Estos valores hay que cargarlos a mano en el Edge Config store de Vercel una vez que
exista — no se pueden crear ni cargar desde acá porque no hay acceso al dashboard.

```json
{
  "precios": {
    "principiante": 75000,
    "avanzado": 125000
  },
  "flags": {
    "checkout_habilitado": false,
    "registro_habilitado": false,
    "fase": "2"
  },
  "links": {
    "calculadora": "https://ogcircle.com/calculadora",
    "whatsapp": "https://wa.me/5491100000000",
    "traxcargo": "https://traxcargo.com"
  }
}
```

(Los valores de `links` de arriba son placeholders puestos por este ticket — reemplazar
por las URLs reales antes de cargar el store.)

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
