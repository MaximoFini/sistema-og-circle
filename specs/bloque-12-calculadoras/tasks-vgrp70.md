# Tasks: VGRP-70 — Identificar el producto con una foto

**Status:** En curso
**Last updated:** 2026-10-05
**Design:** [design-vgrp70.md](./design-vgrp70.md) · **Requirements:** [requirements-vgrp70.md](./requirements-vgrp70.md)
**Rama:** `feat/vgrp-70-foto-producto` (sale de `feat/vgrp-69-qa-calculadoras`)

## Código

- [x] **A1.** `POST /api/cotizador/identificar-producto` + `route.test.ts`
  (401, 403, 400 ×4, 413, ok, modelo por env, normalización, 502).
- [x] **A2.** `identificarProducto()` y `ProductoIdentificado` en `lib/cotizador/api.ts`.
- [x] **A3.** `lib/cotizador/achicarImagen.ts` (1600 px, JPEG, respeta EXIF) +
  test de `dimensionesAchicadas`.
- [x] **A4.** `FotoProducto.tsx` con `next/dynamic` desde `CotizadorMaritimo`:
  botón, arrastrar y soltar, estados, tarjeta con confianza y dudas,
  confirmación antes de pisar texto, aviso con confianza < 40.
- [x] **A5.** Política de privacidad: suma "las fotos de productos" y que no se
  guardan. **Confirmar el texto con el equipo** (es legal).
- [x] **A6.** `ProformaUpload`: el mensaje de formato nombra GIF (resto de B12-10).
- [x] **A7.** E2E: foto → descripción → NCM, con la IA mockeada (escrito; se
  corre con `pnpm test:e2e`).
- [x] **A8.** Bundle: `/calculadora/[variante]` sigue en **203 kB** (15,5 → 15,6 kB
  propios, por el subtítulo). Endpoint nuevo: 388 B.
- [x] **A9.** Verificado en local (05/10): una imagen de 3000×4000 sube como JPEG
  de 12 KB; sin clave de IA muestra el error y el campo sigue editable; con
  respuesta ok se completa el campo y la NCM se detecta sola.

## Pendiente

- [ ] **B1. (manual)** QA en celular real (ver checklist en el chat / tasks-vgrp69 F).
- [ ] **B2.** `/design-critique` sobre el paso 1 del marítimo.
- [ ] **B3.** `/simplify` antes del PR.
- [ ] **B4.** PR contra `main` después del de VGRP-69.
