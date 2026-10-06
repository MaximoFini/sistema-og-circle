# Design: VGRP-70 — Identificar el producto con una foto

**Status:** Draft (2026-10-05)
**Last updated:** 2026-10-05
**Requirements:** [requirements-vgrp70.md](./requirements-vgrp70.md)

## Overview

| Pieza | Archivo |
|---|---|
| Endpoint | `app/api/cotizador/identificar-producto/route.ts` (+ `route.test.ts`) |
| Cliente de API | `identificarProducto()` en `lib/cotizador/api.ts` |
| Achicado de la imagen | `lib/cotizador/achicarImagen.ts` (+ test de la parte pura) |
| UI | `components/cotizador/FotoProducto.tsx`, importado con `next/dynamic` desde `CotizadorMaritimo` |

## Endpoint

Copia el patrón de `extraer-documento`: `requierePlan()` → `leerCuerpo()` con
zod → chequeo de 3 MB decodificados → IA → `responderError()`.

- Tipos: `image/jpeg`, `image/png`, `image/webp`. El cliente siempre manda
  JPEG (lo re-codifica al achicar); los otros dos quedan por si se llama
  directo.
- IA: `llamarJSON()` (tool use forzado, 3 intentos, thinking apagado desde
  VGRP-69), `max_tokens: 800`, modelo `ANTHROPIC_MODEL_EXTRACT || "claude-sonnet-5"`.
- Schema: `producto` (string corta), `detalle` (string), `confianza`
  (integer 0-100), `dudas` (string).
- Post-proceso: `confianza` se acota a 0-100 y se redondea; los strings se
  recortan y caen a `""`. Así la UI no tiene que desconfiar del modelo.
- System prompt: describir la mercadería para clasificarla en aduana
  (material, función, uso, composición), no la marca. Si no es un producto
  reconocible, confianza baja y no inventar.

## Achicado de la imagen

`achicarImagen(file)`: `createImageBitmap(file)` → canvas con el lado mayor
en 1600 px como máximo (nunca agranda) → `canvas.toBlob("image/jpeg", 0.85)`.
Si después de eso pasa de 3 MB (muy raro), reintenta a 1200 px y calidad
0,75. Si el navegador no puede decodificar la imagen, tira un error con
mensaje para el usuario.

La cuenta de dimensiones (`dimensionesAchicadas(ancho, alto, max)`) es pura y
tiene test. El canvas no se testea en unit (jsdom no lo implementa); lo cubre
el E2E y el QA manual.

## UI — `FotoProducto`

- Un `<button>` "Identificar con una foto" (con ícono), que abre un
  `<input type="file" accept="image/*">` oculto, y acepta arrastrar y soltar
  sobre el mismo botón (mismo patrón que `ProformaUpload`).
- **Desvío del ticket, a propósito:** sin `capture="environment"`. Con
  `capture`, el celular abre la cámara directo y no deja elegir de la
  galería. Sin `capture`, iOS y Android ya ofrecen "Sacar foto" o "Elegir de
  la galería", que es lo que pide el ticket ("subir o sacar").
- Props: `descripcionActual: string` y `onDescripcion(texto)`.
- Estados: `idle` → `analizando` → `listo` | `error`.
- Resultado: tarjeta (`ncmHit`, la misma de la NCM) con "Lo que vemos en la
  foto", la confianza en barra, `detalle` y las dudas. Si hubo que
  preguntar (campo con texto, o confianza < 40), dos botones: "Usar esta
  descripción" y "Dejar la mía".
- Anuncios en `role="status"`; errores con `FormError`.
- Ayuda (`hint`, para VGRP-69): "Sacale una foto al producto o subí una. La
  IA describe qué es y completa el campo. La foto no se guarda."

`CotizadorMaritimo` lo monta debajo del campo de descripción y le pasa
`setProducto`. El `useEffect` que ya existe dispara la detección de NCM.

## Rendimiento

`FotoProducto` + `achicarImagen` van en un chunk diferido propio. El
marítimo entero ya es diferido, así que el First Load de
`/calculadora/[variante]` no cambia. Se mide con `pnpm build`.

## Tests

- **Route:** 401, 403 (sin llamar a Anthropic), 400 (falta archivo / tipo
  PDF / BMP), 413, 502, ok (modelo, bloque `image`, schema, normalización de
  confianza).
- **Unit:** `dimensionesAchicadas`.
- **E2E:** marítimo → foto (PNG chico generado en el test) → endpoint
  mockeado → el campo se completa y aparece la confianza.
