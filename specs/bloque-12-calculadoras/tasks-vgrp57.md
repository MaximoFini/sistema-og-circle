# Tasks: VGRP-57 — Calculadora de importación (courier) embebida en la app

**Status:** Implementación completa, sin commitear (a pedido del equipo) — 2026-09-28
**Last updated:** 2026-09-28
**Design:** [design-vgrp57.md](./design-vgrp57.md) · **Requirements:** [requirements-vgrp57.md](./requirements-vgrp57.md)
**Rama:** `feat/vgrp-57-calculadora`
**Origen:** `emilianoverabusiness-blip/vegroup@b550803`

Lista liviana: sin ronda de aprobación propia, decidido con el equipo el
2026-09-26. Cada tarea apunta a la sección del design que implementa. Se
tilda a medida que se termina.

## Tramo A — Motor y base NCM

Sin UI ni red.

- [x] **A1. Registro de origen.** `lib/cotizador/ORIGEN.md`: repo, commit y
  mapa archivo original → archivo portado, y cómo portar un cambio futuro.
  *(design: Architecture)*
- [x] **A2. Motor.** `lib/cotizador/calc.ts` + `types.ts`: port literal de
  `src/lib/calc.js`, sin cambiar fórmulas ni constantes. *(Data model)* → US-3
- [x] **A3. Fixtures de paridad del motor.**
  `scripts/cotizador/generar-fixtures.mjs` corre el `calc.js` original sobre
  la matriz de casos y escribe `test/fixtures/cotizador/courier.json`.
  `lib/cotizador/calc.test.ts` exige igualdad exacta. *(Tests)* → US-3
- [x] **A4. Base NCM.**
  - `public/cotizador/ncm-2026-1.json`;
  - `lib/cotizador/ncm/base.ts` (loader con `fetch` + memo);
  - `lib/cotizador/ncm/search.ts` (port literal de `ncmSearch.js`).

  *(Base NCM en el navegador)* → US-3
- [x] **A5. Paridad de la búsqueda.** ~20 consultas reales: mismos SIM, mismo
  orden que el original. *(Tests)* → US-3

## Tramo B — Servidor

En paralelo con el tramo A, en archivos distintos.

- [x] **B1. Dependencia y entorno.**
  - Instalar `@anthropic-ai/sdk`.
  - Agregar `ANTHROPIC_API_KEY` en `lib/env.ts` y `.env.example`, con los
    `ANTHROPIC_MODEL_*` opcionales.

  *(Cliente de Anthropic)*
- [x] **B2. Cliente de Anthropic.** `lib/cotizador/server/anthropic.ts`
  (`server-only`) con `llamarJSON()` y el mismo comportamiento que
  `callAnthropicJSON`. *(Cliente de Anthropic)*
- [x] **B3. Guard.** `lib/cotizador/server/guard.ts` con `requierePlan()`
  (401/403). *(Guard de los endpoints)* → US-2
- [x] **B4. Endpoints.** Los 5 Route Handlers en `app/api/cotizador/*`, con
  prompts, schemas y modelos del original. `extraer-documento` devuelve 413
  con más de 3 MB. Un `route.test.ts` por endpoint. *(Endpoints)* → US-2,
  US-3, US-4, US-6
- [x] **B5. Middleware.**
  - `RUTAS_CON_PLAN` con redirect a `/comprar`.
  - Casos nuevos en `middleware.test.ts`.

  *(Gating: middleware.ts)* → US-2
- [x] **B6. Headers de caché en `next.config.ts`.**
  - `private, no-store` para `/api/cotizador/*`.
  - `immutable` para `/cotizador/*.json`.

  *(Endpoints / Base NCM)*

## Tramo C — UI en Liquid Glass

Depende de A y B.

- [x] **C1. Cliente de API y página.**
  - `lib/cotizador/api.ts`.
  - `app/(app)/calculadora/page.tsx` + `calculadora.module.css`.

  *(Architecture)* → US-1
- [x] **C2. Formulario.**
  - `components/cotizador/CotizadorCourier.tsx` (ex `AgentQuote`) +
    `cotizador.module.css`.
  - Los tres regímenes, NCM con modo degradado, dólar con carga manual,
    depósitos, resumen del courier integral y envío por WhatsApp.

  *(UI: port a Liquid Glass)* → US-3, US-8
- [x] **C3. Paneles de resultados, cargados en diferido.** `RouteBreakdown`,
  `PriceStrategy`, `MarketingAnalysis` (sin `LeadGate`) y `QuoteDoc` con su
  `@media print`. *(UI / Impresión / Rendimiento)* → US-5, US-6, US-7, US-8
- [x] **C4. Proforma.** `ProformaUpload` con validación de 3 MB en el
  navegador. *(UI)* → US-4
- [x] **C5. Navegación.** `destinos.ts` → `/calculadora`; en `InicioShell`, el
  CTA pasa a `NextLink` sin ícono externo. *(Navegación)* → US-1

## Tramo D — Verificación y cierre

- [x] **D1. Chequeos del repo.** Typecheck + Biome + suite de Vitest en verde,
  incluido el test estructural de `server-only`. Verificado 2026-09-28: 61 archivos,
  968 tests.
- [x] **D2. Bundle.** `next build` + `check-bundle-budget.mjs`, con el número
  de `/calculadora` anotado. Si pasa de 200 kB, **frenar y consultar** con el
  equipo. *(Rendimiento)*
  Medido 2026-09-28: 203 kB → **200 kB** (13 kB propios + 187 kB shared)
  tras diferir búsqueda NCM y proforma (design → "Medición real").
- [x] **D3. E2E en Playwright.**
  - Un usuario `principiante` cotiza en courier integral.
  - Un usuario `ninguno` termina en `/comprar`.

  *(Tests)*
- [x] **D4. Revisión visual.** En el navegador, mobile y desktop, y después
  `/design-critique`. Si se tocó `Icon.tsx`, también `/design-system`.
  *(US-8)*
  Hecho 2026-09-28 con el usuario seed `principiante` sobre el build de
  producción. Cotización completa en régimen general, con la IA en modo
  degradado porque no hay `ANTHROPIC_API_KEY` local. Resultados:
  - Desktop 1280 y mobile 375 sin scroll horizontal.
  - Arreglado: el botón "Subir proforma" se salía de la tarjeta en mobile.
  - `/design-system`: los tres íconos nuevos respetan grilla y trazo. La tabla
    de `DESIGN.md` estaba desactualizada (le faltaba `escudo`) y ahora lista
    los 17.
  - Hallazgos que quedan para decidir con el equipo: ver el reporte de cierre.
- [x] **D5. Documentación.**
  - `docs/RENDIMIENTO.md` si cambia algún presupuesto. No aplica: no cambió
    ninguno.
  - Registro de avance en Plane.
  - `/simplify` antes del PR. **Queda pendiente**: el equipo pidió no
    commitear ni abrir PR todavía. Se corre cuando se decida abrir el PR.
