# Tasks: VGRP-58 — Cotizador marítimo embebido en la app

**Status:** Lista liviana, sin ronda de aprobación propia (mismo criterio que VGRP-57)
**Last updated:** 2026-09-28
**Design:** [design-vgrp58.md](./design-vgrp58.md) · **Requirements:** [requirements-vgrp58.md](./requirements-vgrp58.md)
**Rama:** `feat/vgrp-57-calculadora` (mismo worktree que VGRP-57, no se abre uno nuevo)
**Origen:** `emilianoverabusiness-blip/vegroup@b550803`
**Depende de:** VGRP-57 completo (Tramos A–D ya implementados en este worktree)

Cada tarea apunta a la sección del design que implementa. Se tilda a medida
que se termina.

## Tramo A — Motor marítimo

Sin UI ni red. En paralelo con nada: es la base de todo lo demás.

- [x] **A1. Registro de origen.** Sumado a `lib/cotizador/ORIGEN.md` el mapa
  de archivos de VGRP-58 (`calcMaritimo.js`/`tarifasMaritimo.js`/`dolar-cda.js`/
  `Maritimo*.jsx`) a la tabla existente, y sacada la fila de "no portados".
  *(Architecture)*
- [x] **A2. Motor.** `lib/cotizador/calcMaritimo.ts`: port literal de
  `calcMaritimo(inp)`, `medidas()`, `calcAmbas()`, `contenedorSugerido()`, sin
  cambiar fórmulas ni constantes. Tipos (`EntradaMaritimo`, `ResultadoMaritimo`,
  `ResultadoAmbas`, etc.) agregados en el mismo archivo, ajustados al shape
  real del motor. *(Data model)* → US-3
- [x] **A3. Tarifas y utilidades.** `lib/cotizador/tarifasMaritimo.ts`: port
  literal de `FLETE`, `SEGURO_PCT`, `FIJOS`, `PERCEPCIONES`,
  `ARANCEL_SIM`, `CONTENEDORES`, `PUERTOS`, `PUERTO_DESCARGA`,
  `WHATSAPP_DESPACHANTE`, `sugerirPuerto()` y los `fmt*`. *(Data model)* → US-3
- [x] **A4. Fixtures de paridad del motor.**
  `scripts/cotizador/generar-fixtures-maritimo.mjs` corre el
  `calcMaritimo.js`/`tarifasMaritimo.js` **originales** (mismo mecanismo que
  `generar-fixtures.mjs`, ruta al clon por argumento) y genera 23 casos
  cubriendo lo que prueba `calcMaritimo.test.mjs` (bloque fijo, TN/m³, caso
  "set de herramientas", override de flete, FOB 0, `contenedorSugerido`,
  `sugerirPuerto`, `calcAmbas`). Escribe `test/fixtures/cotizador/maritimo.json`.
  `lib/cotizador/calcMaritimo.test.ts` exige `toEqual` exacto contra el motor
  portado — **34 tests, todos en verde** (23 de paridad exacta contra el
  fixture + 11 de invariantes/constantes, replicando las ~40 comprobaciones
  individuales del original ya que cada caso compara el objeto de resultado
  completo). *(Tests)* → US-3
- [x] **A5. Paridad de `sugerirPuerto`.** 7 casos de provincia/ciudad (una por
  cuenca + variantes), un caso con tilde ("Shanghái"), un caso sin match y uno
  vacío (`null` en ambos), en el mismo fixture. *(Tests)* → US-3

## Tramo B — Servidor: endpoint del CDA

En paralelo con el tramo A, en archivos distintos. Reusa el guard y el
cliente de Anthropic de VGRP-57 sin tocarlos.

- [x] **B1. Endpoint `dolar-cda`.**
  `app/api/cotizador/dolar-cda/route.ts`: `requierePlan()` primero, después
  `parseHistorial(html)` (port literal del regex del original) sobre
  `cda.org.ar/historial_dolar.php`, caché in-memory de 30 min
  (`TTL_MS`), `Cache-Control: private, no-store`. Devuelve
  `{ fecha, compra, venta, fuente }`. 502 explícito si el fetch falla o si
  `parseHistorial` no encuentra filas — nunca un valor inventado.
  *(Endpoint nuevo: POST /api/cotizador/dolar-cda)* → US-4
- [x] **B2. Tests del endpoint.** `route.test.ts` — **7 tests, todos en
  verde**: HTML de muestra real →
  filas parseadas bien; HTML sin filas (markup cambiado) → 502 con el
  mensaje de cargar a mano; fetch que tira → 502; 401 sin sesión; 403 con
  `ninguno` **sin llamar al CDA** (se verifica que el mock de `fetch` no se
  invoca). *(Tests)* → US-4

## Tramo C — UI en Liquid Glass

Depende de A y B, y de que VGRP-57 ya esté en el worktree (lo está).

- [x] **C1. `lib/cotizador/api.ts`: `getDolarCDA()`.** Agregada la interfaz
  `CotizacionCda` y la función `getDolarCDA()` sobre el mismo `post()`
  privado que ya maneja 401/403. *(Cliente de Anthropic / Contratos)*
- [x] **C2. Tipos del motor marítimo.** Agregados a `lib/cotizador/types.ts`
  como re-export de `lib/cotizador/calcMaritimo.ts` (mismo criterio que
  `calc.ts`: los tipos viven junto al motor y se re-exportan desde
  `types.ts`): `EntradaMaritimo`, `EntradaAmbas`, `ResultadoMaritimo`,
  `ResultadoAmbas`, `ContenedorSugerido`, `Despacho`, `Operativos`,
  `Totales`, `Gravamenes`, `LineaOperativa`; más `FiscalMaritimo` (posición
  fiscal efectiva de la UI). *(Data model)*
- [x] **C3. `CotizadorSelector`.**
  `components/cotizador/CotizadorSelector.tsx` + radio group de 2 opciones
  (Courier / Marítimo) reusando las clases `regimen`/`regimenElegido` de
  `cotizador.module.css` (mismo patrón visual que el selector de régimen, sin
  CSS nuevo). Monta `CotizadorCourier` estático (ya existe) y
  `CotizadorMaritimo` con `next/dynamic({ ssr: false })`, cargado recién al
  elegir "Marítimo". Al cambiar de opción React desmonta el formulario del
  otro modo (no se renderiza), así que su estado se descarta.
  `app/(app)/calculadora/page.tsx` pasa a montar `<CotizadorSelector/>` en
  vez de `<CotizadorCourier/>` directo — sin tocar el resto de la página.
  *(Architecture / Rendimiento y presupuesto de bundle)* → US-1
- [x] **C4. `CotizadorMaritimo`.**
  `components/cotizador/CotizadorMaritimo.tsx` (ex `MaritimoQuote.jsx`) +
  `maritimo.module.css`: los 4 pasos (Producto, Carga, Origen, Cotización),
  reusando `ProformaUpload`, `searchNCM`/`loadBase` diferidos,
  `identifyNCM`/`suggestPartidas`/`extractDocument` de VGRP-57. El puerto de
  carga es un radio group `<fieldset>` de 3 opciones (Qingdao/Shanghái/
  Shenzhen), reusando el mismo patrón `regimen`/`regimenElegido` — no se creó
  un `Select` nuevo. El TC se carga con `getDolarCDA()` al montar; si falla,
  el campo queda editable a mano con el aviso, nunca un valor inventado.
  *(UI: port a Liquid Glass)* → US-3, US-4
- [x] **C5. `MaritimoResultado`.**
  `components/cotizador/MaritimoResultado.tsx`: las dos opciones
  (consolidado/full) lado a lado en `maritimo.module.css` (`.dos`/`.opcion`),
  la activa con `accent`; desglose en tabla (`data` a la derecha, filas
  recuperables en `--success`, totales en `raised`); aviso de "estimado" con
  el link de WhatsApp al despachante (`WHATSAPP_DESPACHANTE` portado sin
  cambios). *(UI: port a Liquid Glass)* → US-3
- [x] **C6. `MaritimoQuoteDoc`.**
  `components/cotizador/MaritimoQuoteDoc.tsx` + `.module.css` propio: hoja
  imprimible con `createPortal` + `window.print()`, mismo mecanismo
  `:has()`/`:not()` que `QuoteDoc.module.css` de VGRP-57 (comentario ahí
  explica por qué esa forma exacta). La marca VEGROUP se porta igual que
  está — misma decisión pendiente que B12-07, hasta que el equipo decida
  sobre las dos hojas juntas. *(Impresión)* → US-5

## Tramo D — Verificación y cierre

- [x] **D1. Chequeos del repo.** `pnpm typecheck` — sin errores. `pnpm lint`
  (Biome sobre todo el repo, 322 archivos) — sin errores. `pnpm vitest run` —
  **1126 passed, 3 todo, 10 failed**; los 10 que fallan son pre-existentes y
  no tocan nada de este ticket: 1 flake de timing en
  `test/integration/auth-actions.test.ts`, 1 diff de shape en
  `test/integration/perfil-route.test.ts` (campo `esAdmin` — VGRP-27/50, no
  relacionado) y 8 en `test/integration/webhook-mercadopago.test.ts` que
  fallan por falta de la variable de entorno `MERCADOPAGO_WEBHOOK_SECRET` en
  este worktree, no por código. Los tests nuevos de A4 (34), A5 (incluidos en
  los 34) y B2 (7) están todos en verde. El estructural de `server-only`
  (`test/structural/server-only-boundary.test.ts`, 12 tests) sigue en verde
  con `dolar-cda/route.ts` adentro.
- [x] **D2. Bundle.** `next build` + `check-bundle-budget.mjs`:
  **`/calculadora` con el selector puesto quedó en exactamente 200 kB** de
  First Load JS — el mismo número que documentaba B12-14 antes de este
  ticket (courier estático sigue pagando el presupuesto solo; el selector en
  sí no agrega peso medible al chunk de la página). `check-bundle-budget.mjs`
  confirma: "45 rutas leídas, shared 187.0 kB — Todas las rutas dentro de su
  presupuesto". El chunk diferido de `CotizadorMaritimo` (motor +
  `tarifasMaritimo` + UI + `MaritimoResultado`/`MaritimoQuoteDoc`, repartido
  en varios chunks por el split de Next) pesa ~48 kB sin minificar entre los
  tres chunks que lo contienen — se descarga recién al elegir "Marítimo", no
  toca el First Load JS de `/calculadora`. **No hizo falta parar ni tocar el
  presupuesto.** Nota aparte, no relacionada al código: el build falló la
  primera vez por `ENOSPC` (disco del entorno sin espacio) — se liberó
  borrando `.next` de este worktree antes de reconstruir; no es un problema
  del port. *(Rendimiento)*
- [x] **D3. E2E en Playwright — corrido, en verde.** Agregado
  `test.describe("cotizador marítimo embebido (VGRP-58)")` a
  `e2e/calculadora.spec.ts`: un usuario `principiante` entra a
  `/calculadora`, elige "Marítimo" en el selector, cotiza con datos
  manuales (volumen/peso/FOB/TC a mano, sin escribir producto — sin IA,
  determinístico) y ve las dos opciones (consolidado + full), verificando
  además que no salió ningún request a los endpoints/hosts de IA. Reusa el
  test ya existente de `ninguno` → `/comprar` (mismo describe de VGRP-57, no
  hay ruta nueva que probar aparte).
  Con el disco liberado a 13 GB se pudo correr: `PLAYWRIGHT_PORT=3211
  pnpm test:e2e e2e/calculadora.spec.ts`. Dos hallazgos en el camino, los dos
  de infraestructura de test, no de producto:
  - **Puerto 3000/3100 ocupados por servidores de OTRAS sesiones/worktrees**
    en la misma máquina: la primera corrida reusó (`reuseExistingServer`)
    uno de esos servidores ajenos y los 46 tests fallaron en cadena contra
    una página de login con dos campos "Contraseña" (no es este código). Se
    frenó esa corrida (`TaskStop`) para no seguir generando tráfico contra
    el servidor de otra sesión, y se repitió apuntando a un puerto propio
    libre (3211) con `PLAYWRIGHT_PORT`.
  - El primer intento del describe nuevo falló por un locator ambiguo en el
    test mismo (`getByText("Marítimo consolidado")` resolvía a 3 elementos:
    el botón de opción, el `<h3>` del desglose y la fila de la tabla de
    comparación) — se corrigió a `getByRole("button", { name: /^Marítimo
    consolidado/ })` / `.../^Marítimo full/`. No es un bug de la UI, era el
    test.
  - Con esas dos correcciones: **el test de VGRP-58 pasa solo (4,8 s)** y,
    en la corrida completa de `calculadora.spec.ts`, **los 4 tests de
    VGRP-57 + el de VGRP-58 pasan los 5, en verde**. *(Tests)*
- [x] **D4. Revisión visual — hecha.** Con el disco liberado (13 GB), se
  levantó `pnpm build && PORT=3211 pnpm start` y se revisó `/calculadora` en
  el navegador con un usuario seed `principiante`, en desktop (1280px) y
  mobile (375px): selector courier/marítimo, los 4 pasos del formulario
  marítimo, el desglose de resultados (consolidado y full) y la hoja
  imprimible (confirmada montada en el DOM vía `[data-maritimo-quote-doc]`,
  mismo mecanismo `:has()` que `QuoteDoc` de VGRP-57 — no se pudo capturar el
  print-preview real desde el navegador automatizado, pero la estructura y el
  CSS son un calco 1:1 del de courier, ya verificado). Se confirmó además que
  el TC del CDA carga en vivo (`CDA 29/09/2026 · venta 1.524,50`) y que la
  tabla de desglose scrollea horizontal en mobile sin desbordar la tarjeta.
  **Un hallazgo real, corregido en el momento** (trivial y visual, mismo
  criterio que B12-00): en 375px el `<dl>` de 3 columnas de cada opción
  (Total a pagar / Aumento s/FOB / Por unidad) se superponía — anotado y
  corregido como **B12-15** en `bugs.md` (`maritimo.module.css`: `.opcionDl`
  de `repeat(3, ...)` fijo a `repeat(auto-fit, minmax(90px, 1fr))`). Después
  se corrió `/design-critique` sobre la pantalla — sin hallazgos adicionales
  bloqueantes. El selector y el radio group de puerto reusan clases
  existentes de `cotizador.module.css` sin tocar `components/ui`, así que
  **no hizo falta `/design-system`**. *(US-6)*
- [x] **D5. Documentación.**
  - `docs/RENDIMIENTO.md`: **no aplica** — D2 confirmó que `/calculadora`
    se mantuvo en los 200 kB existentes (mismo número que B12-14 antes de
    este ticket), no cambió ningún presupuesto.
  - Registro de avance en Plane (página "Orden Implementaciones", Bloque
    12): hecho desde la sesión principal (fuera de este worktree) — no
    tocado acá.
  - `/simplify` antes del PR — sigue **pendiente por diseño**, junto con el
    de VGRP-57, hasta que el equipo decida abrir el PR conjunto de todo el
    Bloque 12 (instrucción explícita: no correrlo en este pase).
