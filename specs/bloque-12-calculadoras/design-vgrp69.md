# Design: VGRP-69 — QA de courier y marítimo, marca OG Circle y ayuda por campo

**Status:** Draft (2026-10-05)
**Last updated:** 2026-10-05
**Requirements:** [requirements-vgrp69.md](./requirements-vgrp69.md)

## Overview

No hay arquitectura nueva: todo pasa sobre los componentes que dejaron
VGRP-57/58. Los cambios son cuatro:

| Cambio | Dónde |
|---|---|
| Contacto de WhatsApp desde la config | `app/(app)/calculadora/[variante]/page.tsx` → `CotizadorSelector` → `CotizadorCourier` / `CotizadorMaritimo` (prop `whatsappContacto`) |
| Marca OG Circle | `CotizadorCourier`, `QuoteDoc`, `MaritimoQuoteDoc`, `PriceStrategy`, `RouteBreakdown`, prompts de `analisis-marketing`, `identificar-ncm`, `sugerir-partidas` |
| WhatsApp del resultado marítimo | `lib/cotizador/whatsappMaritimo.ts` (texto, puro y testeable) + botón en `MaritimoResultado` |
| Ayuda por campo | `hint` de `TextField` en los dos formularios + un `<details>` "Qué significa cada concepto" en `RouteBreakdown` y `MaritimoResultado` |

Más los arreglos de B12-01, 02, 03, 09 y 10.

## Contacto de WhatsApp desde la config

La página es un Server Component **estático** (SSG + `revalidate = 3600`).
Para no volverla dinámica, se lee igual que la tarjeta de desbloqueo
(`getOfertaPlan()`): con una función de `lib/config` cacheada por
`unstable_cache`.

- `lib/config/index.ts` suma `getWhatsappContacto(): Promise<string>`, que
  devuelve `links.whatsapp` a través de `getLinks()`. `getLinks()` ya está
  envuelta en `unstable_cache` con el tag `config-links` y `revalidate: 3600`,
  y tiene fallback si Edge Config falla (fail-open: un link viejo no cuesta
  plata).
- **Por qué no `getLinks()` directo en la page:**
  `test/structural/edge-config-dynamic.test.ts` prohíbe llamar
  `getPrecios`/`getFlags`/`getLinks` desde una page estática. El test existe
  por un bug real (un precio congelado en el HTML de build). Acá el valor
  viaja cacheado y la página se regenera cada hora, igual que el precio de la
  tarjeta con `getOfertaPlan()`. Es el mismo patrón, ya aceptado en VGRP-77.
- La page pasa `whatsappContacto` a `CotizadorSelector`, y este a cada
  cotizador.

## Marca OG Circle

| Lugar | Antes | Después |
|---|---|---|
| WhatsApp courier, título | `*VEGROUP — Cotización …*` | `*OG Circle — Cotización …*` |
| WhatsApp courier, pie | `WhatsApp: +54 9 11 7639-2303 · vegroup.com.ar` | `OG Circle · <links.whatsapp>` |
| Número de cotización courier | `VG-AAAAMMDD-HHMM` | `OG-AAAAMMDD-HHMM` |
| `QuoteDoc`, logo | `VE<span>GROUP</span>` | `OG <span>CIRCLE</span>` |
| `QuoteDoc`, pie | VEGROUP + teléfono + mail + Instagram | `OG Circle — Logística e importación internacional · Miami · Barcelona · Guangzhou · Buenos Aires` + `WhatsApp <links.whatsapp>` |
| `QuoteDoc` y `RouteBreakdown` | "gastos de importación VEGROUP" | "gastos de importación" |
| `MaritimoQuoteDoc`, firma | VEGROUP | OG Circle |
| `PriceStrategy`, eyebrow | `VEGROUP · Estrategia de venta` | `OG Circle · Estrategia de venta` |
| Courier, subtítulo | "depósito VEGROUP" | "depósito" |
| Courier, hint TC BNA | "Gastos VEGROUP, impuestos" | ayuda nueva (ver abajo) |
| Prompts de IA | "…para VEGROUP, empresa argentina de courier…" | "…para una empresa argentina de courier e importación…" |

Lo que **no** cambia: los comentarios de código que citan el origen
(`vegroup@b550803`) y las claves internas del motor (`comisionVegroup`). El
label visible de esa clave en `calc.ts` ya es "Gestión operativa ($5/kg)", sin
marca, así que el motor no se toca.

## WhatsApp del resultado marítimo

`lib/cotizador/whatsappMaritimo.ts` exporta `textoResumenMaritimo()`, una
función pura (sin React), con un test unitario:

```
*OG Circle — Cotización marítima MAR-123456*
Producto: set de herramientas
Posición SIM: 8206.00.00.900
Carga: 8,501 m³ · 5.500 kg · Shanghái → Buenos Aires

*Consolidado (LCL):* US$ … costo real · US$ … a pagar
*Full (FCL, 1 × 20' ST):* US$ … costo real · US$ … a pagar (estimado)

OG Circle · https://wa.me/…
```

`MaritimoResultado` recibe `producto` y `whatsappContacto`, y suma el link
"Enviar por WhatsApp" (`styles.linkWhatsapp`, el mismo del courier) en la
barra de acciones, al lado de "Descargar PDF". Usa `wa.me/?text=` sin número,
igual que el courier: el usuario elige a quién mandarlo.

## Ayuda por campo

Sin componente nuevo: el `hint` de `TextField` ya arma el
`aria-describedby`. Así no hace falta `/design-system`.

**Courier:**

| Campo | Ayuda |
|---|---|
| Descripción del producto | Qué es y para qué sirve, en tus palabras. Ej: "auriculares bluetooth". La IA busca la posición arancelaria. |
| Precio FOB (USD) | Lo que le pagás al proveedor por la mercadería, sin flete. Está en la factura o proforma. |
| Peso del paquete (kg) | Peso total con caja, en balanza. Ej: 4,5. |
| Unidades totales | Cuántos productos vienen en total, sumando todas las cajas. |
| Dimensiones por caja | Medidas de una caja en cm. Con esto se calcula el peso volumétrico. |
| Cajas / bultos | Cuántas cajas iguales mandás. |
| TC BNA | Dólar oficial del Banco Nación. Con este se pagan impuestos y gastos en Argentina. |
| TC CCL / Cripto | Dólar con el que le pagás al proveedor afuera. |

**Marítimo:** descripción, posición SIM / DIE / TE / IVA manuales, volumen
(m³ o CBM, del packing list), peso bruto, unidades, FOB, dirección del
fabricante, proveedor, TC CDA y flete del contenedor completo.

El hint del TC (CDA y BNA) sigue mostrando el estado de la carga (fecha o
"cargalo a mano"); la explicación se suma antes.

**Conceptos del resultado:** un `<details>` nativo "¿Qué significa cada
concepto?" al final de `RouteBreakdown` (CIF, DIE, TE, IVA y percepciones
recuperables, peso volumétrico) y de `MaritimoResultado` (TN/m³, CIF, DIE/TE,
percepciones recuperables, consolidado vs. full). Se abre con teclado y no
pesa en la carga inicial: los dos componentes ya se cargan en diferido.

## Bugs

- **B12-01** (`QuoteDoc`): `{selected.impInternos && Number(...) > 0 && …}`
  pasa a `{Number(selected.impInternos) > 0 && …}`.
- **B12-02** (`RouteBreakdown`): `current.dolarCCL && current.dolarBN && …`
  pasa a `Number(current.dolarCCL) > 0 && Number(current.dolarBN) > 0 && …`.
- **B12-03** (`ncm/search.ts`): el lookup usa `Object.hasOwn(SYNONYMS, k)`
  antes de leer. No cambia el ranking: solo deja de leer el prototipo.
- **B12-09** (`server/anthropic.ts`): las tres llamadas mandan
  `thinking: { type: "disabled" }`. Los modelos por defecto (`claude-sonnet-5`,
  `claude-opus-4-8`) lo aceptan. Las tareas son cortas y de formato fijo, y
  `tool_choice` forzado tampoco convive con el thinking. **Ojo:** si alguien
  configura un modelo 5.5 por env, tanto el `disabled` como el `tool_choice`
  forzado dan 400. Se documenta en el código.
- **B12-10** (`extraer-documento`): el 400 dice "JPG, PNG, WebP o GIF".

## Rendimiento

- Ayuda del courier: texto en el chunk estático de `/calculadora/[variante]`.
  Se mide con `pnpm build` antes y después. Margen hoy: ~3 kB contra 205.
- `<details>` del resultado, WhatsApp marítimo y marca: en chunks diferidos,
  sin impacto en el First Load.
- Si la ayuda se pasa del presupuesto, el plan B es mover el mapa de ayudas a
  un módulo importado en diferido al montar.

## Tests

- **Unit:** `whatsappMaritimo.test.ts` (texto, "estimado", acentos y "&"
  codificados); `search` con "constructor"/"constructores"; `anthropic.test.ts`
  verifica `thinking: disabled`; `getWhatsappContacto` con y sin Edge Config.
- **Route:** se completa lo que falte de 400 por tipo/datos en los 5
  endpoints de IA (401/403/413/502/ok ya están cubiertos).
- **E2E** (`e2e/calculadora.spec.ts`), con la IA mockeada por `page.route`:
  courier comercial (detección de NCM mockeada → cotiza → link de WhatsApp sin
  "VEGROUP") y marítimo (carga manual → resultado → link de WhatsApp con los
  dos totales).
