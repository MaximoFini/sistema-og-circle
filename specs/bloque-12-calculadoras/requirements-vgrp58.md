# Requirements: VGRP-58 — Cotizador marítimo embebido en la app

**Status:** Approved (2026-09-26) — **Ajustado (2026-09-28):** el cotizador
marítimo deja de tener ruta propia (`/maritimo`) y pasa a ser una
**variante dentro de `/calculadora`**: el usuario elige, desde la misma
página, si cotiza courier (aéreo) o marítimo. Decisión del equipo — sin
entrada propia en el menú ni banner propio en Inicio.
**Last updated:** 2026-09-28

## Summary

Segundo ticket del **Bloque 12 — Calculadoras dentro de la plataforma**
(proyecto VGRP en Plane). Depende de VGRP-57 (`requirements-vgrp57.md`).

El repo de la calculadora tiene un cotizador marítimo (`/maritimo`) que cobra
por TN/m³ en lugar de por kg y cotiza carga consolidada y contenedor completo,
con el criterio del despachante (Matías, 30/08/2026). Hoy no tiene ninguna
entrada desde la plataforma. Este ticket lo trae **adentro de `/calculadora`**,
como una segunda modalidad que el usuario elige en la misma pantalla, con
estas características:

- mismo entry point que el courier: `/calculadora`, sin ruta ni menú propios;
- un selector visible arriba de todo para elegir courier o marítimo;
- detrás de la sesión y del gating por nivel que ya protege `/calculadora`;
- con el estilo Liquid Glass del resto del sistema.

## Origen del código

| Qué | Valor |
|---|---|
| Repo | `emilianoverabusiness-blip/vegroup` (privado) |
| Commit base | `b550803` (2026-09-03), el mismo que VGRP-57 |
| Estrategia | **Copia única**, con el mismo criterio que VGRP-57 |
| Qué se porta | `MaritimoQuote`, `MaritimoResultado`, `MaritimoQuoteDoc`, `lib/calcMaritimo.js`, `lib/tarifasMaritimo.js`, el endpoint `dolar-cda` y `scripts/calcMaritimo.test.mjs` (40 comprobaciones) |
| Qué reutiliza de VGRP-57 | Base NCM y búsqueda, `identify`/`suggest`, `extract` (lectura de proforma/packing list), cliente de API y gating de los endpoints. Todo lo que no tiene números adentro. |

## Goals

- Un usuario con plan cotiza una carga marítima (consolidado y full) sin salir
  de la app, con el **mismo contenido y comportamiento** que
  `/maritimo` del original en el commit base.
- Elige entre courier y marítimo desde un selector dentro de `/calculadora`,
  sin navegar a otra ruta.
- Los números son **idénticos** a los del original: las 40 comprobaciones del
  test original pasan contra el motor portado sin tocar los valores
  esperados.
- La UI copia el sistema visual actual de la app (Liquid Glass) y se ve
  consistente con el resto de `/calculadora`.

## Non-goals

- Todo lo que ya es non-goal en VGRP-57 (`/interno`, login por clave, límite
  de uso, lead, tarifas editables sin deploy, cambios de negocio).
- **Ruta propia (`/maritimo`), entrada de menú propia o banner propio en
  Inicio.** Decisión del equipo (2026-09-28): un solo entry point,
  `/calculadora`, con un selector adentro.
- **Tarifa real de contenedor completo.** Hoy consolidado y full salen con la
  misma tarifa por m³ porque el full lo cotiza el despachante caso por caso.
  No es un bug del port.
- **Cambiar el número de WhatsApp del despachante** (`WHATSAPP_DESPACHANTE`).
  Se porta el valor del commit base.

## User stories

### US-1: Elegir entre courier y marítimo dentro de la calculadora

Como usuario con plan, quiero un selector dentro de `/calculadora` para
cotizar por barco sin salir de la pantalla ni buscarlo en otro lado.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar, arriba de todo en `/calculadora`, un selector con
  dos opciones: "Courier" (comportamiento actual, seleccionado por defecto) y
  "Marítimo".
- WHEN el usuario elige "Marítimo" THE SYSTEM SHALL reemplazar el formulario
  de courier por el de marítimo, en la misma página y sin recargar.
- THE SYSTEM SHALL NOT agregar un destino nuevo al menú de navegación ni un
  banner nuevo en Inicio: el entry point sigue siendo "Calculadora" único.
- WHEN el usuario cambia de opción THE SYSTEM SHALL descartar la cotización en
  curso del otro modo (mismo criterio que el original: nada se persiste).

### US-2: Gating por plan

Como negocio, quiero que solo los usuarios con plan usen el cotizador
marítimo.

**Acceptance criteria:**

- El gating ya existe para `/calculadora` completa (VGRP-57): no hace falta
  uno nuevo por ruta, porque no hay ruta nueva.
- IF un usuario sin sesión o con nivel `ninguno` llama directamente al
  endpoint del dólar CDA (o a cualquiera de los compartidos con VGRP-57) THEN
  THE SYSTEM SHALL responder 401/403 en JSON y SHALL NOT llamar al CDA ni a
  Anthropic.

### US-3: Cotizar una carga marítima (paridad con `/maritimo`)

Como usuario con plan, quiero cotizar una carga marítima consolidada o en
contenedor completo, para comparar contra el courier aéreo.

**Acceptance criteria:**

- THE SYSTEM SHALL seguir los cuatro pasos del original:
  1. Producto: NCM por IA o carga manual.
  2. Carga: packing list/proforma, o carga a mano con reconstrucción del CBM
     por dimensiones × cantidad cuando el documento no lo trae.
  3. Origen: sugerencia de puerto entre Qingdao, Shanghái y Shenzhen según la
     dirección del fabricante, con el mapa fijo de `tarifasMaritimo.js`, sin
     IA.
  4. Cotización: consolidado y full, juntas.
- THE SYSTEM SHALL cotizar con el motor portado de `calcMaritimo.js` y las
  tarifas de `tarifasMaritimo.js`, sin cambios:
  - flete pagado = TN/m³ × 250 + 300 de BL;
  - flete declarado = 70% del pagado;
  - seguro = 1% × (FOB + flete pagado);
  - siete gastos fijos;
  - percepciones;
  - arancel SIM.
- WHEN se calcula con las mismas entradas THE SYSTEM SHALL producir los
  mismos importes que el original.
- WHEN se muestra la opción full sin tarifa firme THE SYSTEM SHALL mostrar el
  contenedor sugerido, la ocupación, qué limita (peso o volumen) y el aviso de
  "estimado" con el link de WhatsApp al despachante, igual que el original.

### US-4: Tipo de cambio del CDA

Como usuario con plan, quiero que la cotización use el tipo de cambio del
Centro Despachantes de Aduana, que es el que usa el despachante para la base
imponible.

**Acceptance criteria:**

- WHEN se abre el cotizador marítimo THE SYSTEM SHALL cargar el tipo de
  cambio del CDA (`cda.org.ar/historial_dolar.php`), no el BNA.
- IF el CDA no responde o cambió el formato de la tabla THEN THE SYSTEM SHALL
  fallar de forma explícita, pedir el valor a mano y SHALL NOT inventar uno.

### US-5: Imprimir la cotización

Como usuario con plan, quiero una hoja imprimible de la cotización marítima.

**Acceptance criteria:**

- WHEN el usuario toca imprimir THE SYSTEM SHALL abrir el diálogo de
  impresión con la hoja equivalente a `MaritimoQuoteDoc`.
- En esa impresión SHALL NOT aparecer el menú, el header ni ningún otro
  elemento de la app.

### US-6: Se ve como el resto de la app

**Acceptance criteria:**

- THE SYSTEM SHALL construir la UI con las mismas primitivas, componentes y
  patrones visuales que VGRP-57 dejó en `/calculadora`, y SHALL NOT incluir
  CSS del original.
- THE SYSTEM SHALL funcionar en mobile y en desktop.

## Constraints

- Todas las de VGRP-57 (stack, sistema visual, rendimiento, auth, secretos).
- **Fragilidad del CDA:** el endpoint parsea una tabla HTML de un tercero. El
  test tiene que cubrir el caso "cambió el markup" → error explícito.
- **Paridad verificable:** las 40 comprobaciones de `calcMaritimo.test.mjs` se
  portan a Vitest sin modificar los valores esperados.
- **Orden:** va después de VGRP-57, no en paralelo. Reutiliza su
  infraestructura y su patrón visual.

## Open questions

- Ninguna por ahora.
