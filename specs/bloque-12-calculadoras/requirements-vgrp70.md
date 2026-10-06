# Requirements: VGRP-70 — Cotizador marítimo: identificar el producto con una foto

**Status:** Draft (2026-10-05) — pendiente de aprobación del equipo
**Last updated:** 2026-10-05
**Depende de:** VGRP-69 (rama `feat/vgrp-69-qa-calculadoras`; esta rama sale de ahí
porque los dos tocan el paso 1 de `CotizadorMaritimo.tsx`)

## Summary

En el paso 1 ("Producto") del marítimo, el usuario escribe qué importa y la
IA busca la posición arancelaria. Muchos no saben describir bien el producto.
Este ticket suma **subir o sacar una foto** para que la IA diga qué es y
complete la descripción; desde ahí sigue el flujo de siempre (búsqueda local →
`sugerir-partidas` → `identificar-ncm`).

## Goals

- Desde el celular, una foto de un producto común completa la descripción y
  la NCM se detecta sola.
- Una foto de 6-8 MB funciona: se achica en el navegador antes de subirla.
- Una foto que no muestra un producto da confianza baja y un aviso, no una
  descripción inventada.
- La foto nunca bloquea el flujo: siempre se puede seguir escribiendo a mano.

## Non-goals

- Courier (se puede sumar después: el componente queda aparte).
- Guardar la foto: no se guarda en ningún lado.
- Rate limit propio de `/api/cotizador/*` (hoy solo hay gating por plan; se
  anota como riesgo de costo).

## User stories

### US-1: Identificar el producto con una foto

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar "Identificar con una foto" junto a "Descripción
  del producto" del marítimo.
- WHEN el usuario lo toca en mobile THE SYSTEM SHALL ofrecer sacar la foto o
  elegirla de la galería; en desktop, el selector de archivos o arrastrar y
  soltar.
- WHILE se analiza THE SYSTEM SHALL mostrar un spinner y anunciar el estado
  en una región `aria-live`.
- WHEN vuelve la respuesta y el campo está vacío THE SYSTEM SHALL completarlo
  con `producto` + `detalle`.
- IF el campo ya tenía texto THEN THE SYSTEM SHALL preguntar antes de
  pisarlo ("Usar esta descripción" / "Dejar la mía").
- THE SYSTEM SHALL mostrar lo que entendió la IA, con la confianza y las
  dudas.
- IF la confianza es baja (< 40) THEN THE SYSTEM SHALL avisarlo y NO
  completar el campo solo (queda el botón "Usar igual").
- Al cambiar el texto, la detección de NCM existente vuelve a correr.

### US-2: Fotos de celular

- THE SYSTEM SHALL achicar la imagen en el navegador (lado mayor 1600 px,
  JPEG) antes de subirla, para quedar debajo de los 3 MB decodificados.
- IF la imagen no se puede leer (formato raro) THEN THE SYSTEM SHALL decirlo
  con un mensaje claro.

### US-3: Endpoint `POST /api/cotizador/identificar-producto`

- `requierePlan()` primero: 401/403 sin tocar Anthropic.
- Body validado con zod: `{ fileBase64, mediaType }`, solo JPG, PNG o WebP
  (400), hasta 3 MB decodificados (413).
- `llamarJSON()` con schema `{ producto, detalle, confianza (0-100), dudas }`
  y el modelo `ANTHROPIC_MODEL_EXTRACT`.
- IA falla → 502 genérico.

### US-4: Errores

- Foto no reconocible, archivo grande, formato no soportado o IA caída: cada
  uno con un mensaje claro, y el campo sigue editable.

## Constraints

- El componente nuevo se carga con `next/dynamic`: no suma al First Load de
  `/calculadora/[variante]` (B12-14).
- Accesible con teclado y lector de pantalla.
- Privacidad: la política ya nombra a Anthropic para "los documentos que
  cargás"; se suma "y las fotos de productos".

## Open questions

- Ninguna bloqueante. Riesgo de costo: cada foto es una llamada de visión y
  no hay rate limit propio (anotado como B12-16).
