# Tasks: VGRP-69 — QA de courier y marítimo, marca OG Circle y ayuda por campo

**Status:** En curso
**Last updated:** 2026-10-05
**Design:** [design-vgrp69.md](./design-vgrp69.md) · **Requirements:** [requirements-vgrp69.md](./requirements-vgrp69.md)
**Rama:** `feat/vgrp-69-qa-calculadoras`

Se tilda a medida que se termina. Las tareas con **(manual)** necesitan una
persona: un navegador o un celular real, o la clave real de Anthropic.

## Tramo A — Bugs anotados

- [x] **A1. B12-01.** `QuoteDoc`: sin "0" suelto en impuestos internos.
- [x] **A2. B12-02.** `RouteBreakdown`: sin "0" suelto con un dólar en 0.
- [x] **A3. B12-03.** `ncm/search.ts`: "constructor" no rompe la búsqueda, con
  test.
- [x] **A4. B12-09.** `server/anthropic.ts`: `thinking: disabled`, con test.
- [x] **A5. B12-10.** `extraer-documento`: mensaje de formatos correcto, con
  test.

## Tramo B — Marca OG Circle (B12-07)

- [x] **B1.** `getWhatsappContacto()` en `lib/config`, con test. La page la
  pasa a `CotizadorSelector` → cotizadores.
- [x] **B2.** Courier: título y pie del WhatsApp, prefijo `OG-`, subtítulo del
  depósito.
- [x] **B3.** `QuoteDoc`: logo, grupo "gastos de importación" y pie con el
  WhatsApp de la config.
- [x] **B4.** `RouteBreakdown`, `PriceStrategy` y `MaritimoQuoteDoc`.
- [x] **B5.** Prompts de IA sin VEGROUP (`analisis-marketing`,
  `identificar-ncm`, `sugerir-partidas`), con los tests de prompt
  actualizados.
- [x] **B6.** `grep -rni vegroup` sobre `app/` y `components/`: solo quedan
  comentarios de origen y claves internas.

## Tramo C — WhatsApp del marítimo

- [x] **C1.** `lib/cotizador/whatsappMaritimo.ts` + test.
- [x] **C2.** Botón "Enviar por WhatsApp" en `MaritimoResultado`.

## Tramo D — Ayuda por campo

- [x] **D1.** Courier: `hint` en cada campo.
- [x] **D2.** Marítimo: `hint` en cada campo.
- [x] **D3.** `<details>` "¿Qué significa cada concepto?" en `RouteBreakdown`
  y `MaritimoResultado`.
- [x] **D4.** `pnpm build` + `check-bundle-budget.mjs`: `/calculadora/[variante]`
  ≤ 205 kB. **Medido (2026-10-05): 202 kB antes → 203 kB después** (15,1 → 15,5 kB
  propios). Ojo: el check falla igual por `/admin/contenido/[entidad]` (211 kB),
  que ya estaba así en `main` antes de este ticket.

## Tramo E — Tests automáticos

- [ ] **E1.** Route tests: 400 por tipo/datos en los endpoints que no lo
  tengan.
- [x] **E2.** E2E: courier comercial con IA mockeada (escrito; se corre en E5).
- [x] **E3.** E2E: marítimo con carga manual + WhatsApp (escrito; se corre en E5).
- [ ] **E4.** `pnpm typecheck` en verde; Biome y Vitest en verde sobre las carpetas
  tocadas (cotizador, config, structural). Falta el `pnpm test` completo.
- [ ] **E5. (manual)** `pnpm test:e2e e2e/calculadora.spec.ts` contra el
  Supabase de test.

## Tramo F — Checklist de QA (manual)

Cada fila: **OK**, o el ID del bug anotado en `bugs.md`.

| # | Flujo | Mobile 375 px | Desktop |
|---|---|---|---|
| F1 | Courier integral: cotizar con producto real | | OK (local, 05/10) |
| F2 | Courier pequeños envíos: cotizar | | |
| F3 | Courier comercial: detección de NCM + cotizar | | |
| F4 | Marítimo: carga manual + resultado | OK (local, 05/10) | OK (local, 05/10) |
| F5 | Marítimo: proforma/packing list en **imagen** (con y sin CBM) | | |
| F6 | Marítimo: proforma/packing list en **PDF** | | |
| F7 | Courier comercial: proforma en imagen y en PDF | | |
| F8 | WhatsApp courier (3 regímenes): texto = pantalla, acentos y "&" bien, abre la app | | |
| F9 | WhatsApp marítimo: resultado y link al despachante | | |
| F10 | PDF courier en Chrome / Safari / Firefox: solo la hoja, sin "0" suelto | | |
| F11 | PDF marítimo en Chrome / Safari / Firefox: las dos opciones | | |
| F12 | Ningún "VEGROUP" en pantalla, PDF ni WhatsApp | | |
| F13 | Ayuda de cada campo legible y sin cortes | | |
| F14 | TC: con dolarapi y CDA caídos (sin red al endpoint), campo editable con aviso | | |
| F15 | IA sin `ANTHROPIC_API_KEY`: modo degradado (primera coincidencia local, 50%) | | |
| F16 | IA con clave real: B12-09 (sin 502 intermitentes en 10 búsquedas seguidas) | | |
| F17 | Marketing: navegar a otra página a mitad del streaming, sin errores en consola | | |
| F18 | Teclado: se recorre todo con Tab, el `<details>` abre con Enter/Espacio | | |

## Tramo G — Cierre

- [ ] **G1.** `/design-critique` sobre `/calculadora` (courier y marítimo).
- [ ] **G2.** `/simplify` sobre el diff.
- [ ] **G3.** `bugs.md`: mover B12-01/02/03/07/09/10 a "Corregidos" y anotar
  los nuevos.
- [ ] **G4.** PR contra `main`.
