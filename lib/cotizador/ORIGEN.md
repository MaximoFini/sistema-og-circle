# Origen del cotizador (VGRP-57)

El cotizador de importación courier es un **port** del repo de VEGROUP. No es
un fork vivo: los cambios del original **no llegan solos**, hay que portarlos
a mano con el procedimiento de abajo.

| | |
|---|---|
| **Repo** | `emilianoverabusiness-blip/vegroup` (privado) |
| **Commit** | `b550803` — "Merge pull request #1 from emilianoverabusiness-blip/refactor/tokens-single-source" |
| **Spec** | `specs/bloque-12-calculadoras/design-vgrp57.md` |

## Dos criterios según la capa

- **Números** (`calc.js`, `ncmSearch.js`, `data/ncm.js`, `ncm.json`): port
  **literal** a TypeScript. Ni una fórmula, constante, redondeo u orden de
  operaciones distinto. Los nombres de los exports son los del original
  (`ROUTES`, `calcRoute`, `PEQUEÑOS_ENVIOS`, `searchNCM`…), a propósito, para
  que el diff contra el original se lea archivo por archivo. Lo protegen los
  tests de paridad (ver abajo).
- **Todo lo demás** (UI, endpoints, auth, estilos): se reescribe con los
  patrones de la app. Mismos textos, pasos y orden; otro cómo.

## Mapa archivo original → archivo portado

| Original (`vegroup@b550803`) | En este repo | Tramo | Criterio |
|---|---|---|---|
| `src/lib/calc.js` | `lib/cotizador/calc.ts` (+ tipos en `lib/cotizador/types.ts`) | A | literal |
| `src/data/ncm.js` | `lib/cotizador/ncm/base.ts` | A | literal, salvo `import('./ncm.json')` → `fetch` memoizado |
| `src/data/ncm.json` | `public/cotizador/ncm-2026-1.json` | A | copia byte a byte |
| `src/lib/ncmSearch.js` | `lib/cotizador/ncm/search.ts` | A | literal |
| `api/_anthropic.js` | `lib/cotizador/server/anthropic.ts` | B | reescrito sobre `@anthropic-ai/sdk`, mismo comportamiento |
| `api/_auth.js`, `api/login.js` | `lib/cotizador/server/guard.ts` (`requierePlan()`) + `middleware.ts` | B | reemplazado: sesión y plan de la app, sin clave propia |
| `api/identify.js` | `app/api/cotizador/identificar-ncm/route.ts` | B | prompts, schemas y modelos textuales |
| `api/suggest.js` | `app/api/cotizador/sugerir-partidas/route.ts` | B | ídem |
| `api/extract.js` | `app/api/cotizador/extraer-documento/route.ts` | B | ídem; límite 3 MB (413) |
| `api/analyze.js` | `app/api/cotizador/analisis-marketing/route.ts` | B | ídem |
| `api/dolar.js` | `app/api/cotizador/dolar/route.ts` | B | ídem |
| `src/lib/api.js` | `lib/cotizador/api.ts` | C | sin login ni token |
| `src/components/AgentQuote.jsx` | `components/cotizador/CotizadorCourier.tsx` | C | renombrado (no choca con el marítimo de VGRP-58) |
| `src/components/RouteBreakdown.jsx` | `components/cotizador/RouteBreakdown.tsx` | C | Liquid Glass |
| `src/components/PriceStrategy.jsx` | `components/cotizador/PriceStrategy.tsx` | C | Liquid Glass |
| `src/components/MarketingAnalysis.jsx` | `components/cotizador/MarketingAnalysis.tsx` | C | sin `LeadGate` |
| `src/components/ProformaUpload.jsx` | `components/cotizador/ProformaUpload.tsx` | C | límite 3 MB |
| `src/components/QuoteDoc.jsx` | `components/cotizador/QuoteDoc.tsx` | C | `@media print` propio |
| `src/index.css` (clases del cotizador) | `components/cotizador/cotizador.module.css` | C | no se copia CSS: se compone `glass`/`type` |
| `src/lib/calcMaritimo.js` | `lib/cotizador/calcMaritimo.ts` | A (VGRP-58) | literal |
| `src/lib/tarifasMaritimo.js` | `lib/cotizador/tarifasMaritimo.ts` | A (VGRP-58) | literal |
| `api/dolar-cda.js` | `app/api/cotizador/dolar-cda/route.ts` | B (VGRP-58) | reescrito sobre el patrón de `dolar/route.ts` |
| `src/components/MaritimoQuote.jsx` | `components/cotizador/CotizadorMaritimo.tsx` | C (VGRP-58) | renombrado (mismo motivo que `AgentQuote` → `CotizadorCourier`) |
| `src/components/MaritimoResultado.jsx` | `components/cotizador/MaritimoResultado.tsx` | C (VGRP-58) | Liquid Glass |
| `src/components/MaritimoQuoteDoc.jsx` | `components/cotizador/MaritimoQuoteDoc.tsx` | C (VGRP-58) | `@media print` propio |

**No portados** (fuera de VGRP-57 y VGRP-58):
`src/lib/calcInterno.js`, `src/lib/tarifasInterno.js`, `src/components/Interno*.jsx`,
`TarifasPanel.jsx` (herramienta interna de VEGROUP); `Login.jsx`, `Header.jsx`,
`Footer.jsx`, `App.jsx` y los `*.html` de Vite (los reemplaza la app);
`src/dev/*` y `paridad.html` (fixtures visuales del original).

## Tests de paridad

| Test | Fixture | Qué compara |
|---|---|---|
| `lib/cotizador/calc.test.ts` | `test/fixtures/cotizador/courier.json` | constantes + ~100 casos del motor (3 regímenes × 3 rutas, TC, alícuotas, bordes) con `toEqual` exacto, y `fmtUSD`/`fmtARS` |
| `lib/cotizador/ncm/search.test.ts` | `test/fixtures/cotizador/ncm-busquedas.json` | `searchNCM` y `searchByPartidas`: mismos SIM, mismo orden, mismo score; `getNcm` y `licLabel` |
| `lib/cotizador/ncm/base.test.ts` | — | lo único no literal: el `fetch` de la base (una sola descarga, reintento tras fallo) |
| `lib/cotizador/calcMaritimo.test.ts` (VGRP-58) | `test/fixtures/cotizador/maritimo.json` | constantes + 23 casos del motor marítimo (`medidas`, `calcMaritimo`, `contenedorSugerido`, `sugerirPuerto`, `calcAmbas`) con `toEqual` exacto, más invariantes del caso "set de herramientas" |

Los fixtures **los genera el código original**, no el port:
`scripts/cotizador/generar-fixtures.mjs` importa `calc.js`, `ncmSearch.js` y
`data/ncm.js` directamente del clon (con un hook de carga para el
`import('./ncm.json')`, que en Node exige `with { type: "json" }`; el clon no
se modifica). `scripts/cotizador/generar-fixtures-maritimo.mjs` (VGRP-58) hace
lo mismo con `calcMaritimo.js`/`tarifasMaritimo.js`, sin hook de `.json`
porque no lo necesitan. Los fixtures se commitean y son la referencia; los
scripts no corren en CI porque el repo de origen es privado.

## Cómo portar un cambio futuro del repo vegroup

1. **Clonar el original en el commit nuevo** (fuera de este repo):
   ```sh
   git clone git@github.com:emilianoverabusiness-blip/vegroup.git /tmp/vegroup
   git -C /tmp/vegroup checkout <commit-nuevo>
   ```
2. **Ver qué cambió** desde el commit registrado arriba:
   ```sh
   git -C /tmp/vegroup diff b550803 <commit-nuevo> --stat
   git -C /tmp/vegroup diff b550803 <commit-nuevo> -- src/lib/calc.js
   ```
   Con la tabla de arriba, ubicar el archivo portado de cada archivo tocado.
3. **Portar a mano, línea por línea.**
   - Capa de números: aplicar el mismo cambio, literal. Si el tipado
     obliga a cambiar la lógica, parar y consultarlo; se ajusta el tipo
     (`types.ts`), nunca la fórmula.
   - Endpoints: prompts, schemas de tool use, modelos y reintentos se copian
     textuales.
   - UI: mismo contenido y orden; el estilo sigue siendo Liquid Glass.
4. **Si cambió `src/data/ncm.json`** (base NCM nueva):
   - copiarla byte a byte con **nombre nuevo** (p. ej.
     `public/cotizador/ncm-2026-2.json`) — nunca pisar la anterior: se sirve con
     `Cache-Control: immutable`, así que el nombre versionado es lo que
     invalida la caché de los navegadores;
   - actualizar `URL_BASE_NCM` en `lib/cotizador/ncm/base.ts` y la ruta del
     JSON en `lib/cotizador/ncm/search.test.ts`;
   - borrar el archivo viejo de `public/cotizador/` una vez desplegado.
5. **Regenerar los fixtures con el original**:
   ```sh
   node scripts/cotizador/generar-fixtures.mjs /tmp/vegroup
   ```
   Escribe `courier.json` y `ncm-busquedas.json` y los formatea con Biome.
   Si el cambio agrega un caso borde (una ruta, una tarifa, un régimen),
   sumarlo primero a la matriz del script.
6. **Correr los tests**: `pnpm vitest run lib/cotizador`. Tienen que quedar en
   verde **sin tocar los tests**. El diff de los fixtures tiene que explicarse
   entero por el cambio portado; si cambia algo que no se tocó, el port está
   mal.
7. **Actualizar el commit registrado** en los tres lugares: la tabla de
   arriba, `COMMIT_ESPERADO` en `generar-fixtures.mjs` y el
   `expect(...commit).toBe("b550803")` de los dos tests de paridad. Sumar
   cualquier fila nueva al mapa.
