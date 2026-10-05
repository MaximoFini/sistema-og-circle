# Requirements: VGRP-69 — QA de courier y marítimo, marca OG Circle y ayuda por campo

**Status:** Draft (2026-10-05) — pendiente de aprobación del equipo
**Last updated:** 2026-10-05
**Depende de:** VGRP-57 y VGRP-58 (ya en `main`)
**Antes de:** VGRP-70 (foto del producto): los dos tocan el paso 1 de
`CotizadorMaritimo.tsx`.

## Summary

Bloque 12, segunda etapa. VGRP-57 y VGRP-58 dejaron `/calculadora` con dos
variantes, courier y marítimo. Ninguna tuvo una pasada de QA completa como
producto. Este ticket:

1. las prueba de punta a punta (checklist en `tasks-vgrp69.md`);
2. arregla los bugs anotados que tocan este alcance (B12-01, 02, 03, 09, 10)
   y los nuevos que aparezcan;
3. reemplaza la marca VEGROUP por OG Circle en todo lo que ve el usuario
   (B12-07);
4. suma "Enviar por WhatsApp" al resultado del marítimo;
5. agrega una ayuda corta en cada campo de las dos calculadoras.

## Goals

- Un usuario con plan cotiza en los 3 regímenes de courier y en marítimo, y
  los números de la pantalla, del WhatsApp y del PDF coinciden.
- Ningún texto, PDF ni mensaje que ve el usuario dice VEGROUP.
- El contacto de WhatsApp sale de la config (`links.whatsapp`), no del código.
- Cada campo explica qué es, de dónde se saca y da un ejemplo.

## Non-goals

- **Tocar los motores** (`calc.ts`, `calcMaritimo.ts`, `tarifasMaritimo.ts`).
  Si el QA muestra un número raro, se anota en `bugs.md` con origen
  "original" y se decide aparte.
- **Cambiar datos operativos:** direcciones de los depósitos,
  `WHATSAPP_DESPACHANTE`, tarifas. No se cambian sin confirmarlo con el
  equipo.
- **B12-04** (ranking local) y **B12-05** (acentos de la base), salvo que el
  arreglo sea trivial.
- **Estrategia de venta y análisis de marketing en el marítimo.** Default del
  ticket: no. Queda anotado para otro ticket.
- **Identificar el producto con una foto:** es VGRP-70.

## User stories

### US-1: Compartir la cotización por WhatsApp (courier y marítimo)

Como usuario con plan, quiero mandar el resumen de la cotización por
WhatsApp para pasárselo a un cliente o a un socio.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar "Enviar por WhatsApp" en el resultado de los 3
  regímenes de courier y en el resultado del marítimo.
- THE SYSTEM SHALL armar el texto con los mismos números que se ven en
  pantalla.
- En marítimo, el texto SHALL incluir la referencia, el producto, la posición
  SIM, el volumen y el peso, y los totales de consolidado y full, marcando
  "estimado" si el full no tiene tarifa firme.
- THE SYSTEM SHALL codificar bien los acentos, el "&" y los saltos de línea
  (`encodeURIComponent`).
- El link al despachante del marítimo SHALL quedar como está.

### US-2: Marca OG Circle

Como negocio, quiero que la calculadora hable como OG Circle, no como el
proveedor del que se portó.

**Acceptance criteria:**

- THE SYSTEM SHALL NOT mostrar "VEGROUP" en ningún texto de la UI, del PDF
  (courier y marítimo) ni de los mensajes de WhatsApp.
- THE SYSTEM SHALL tomar el contacto de WhatsApp de `links.whatsapp`
  (`lib/config`, Edge Config), con el fallback de la config si Edge Config
  falla. No se escribe ningún teléfono a mano.
- El número de cotización del courier SHALL dejar de usar el prefijo `VG-`.
- Los prompts de IA que pueden filtrar la marca a una respuesta visible
  (análisis de marketing) SHALL NOT nombrar a VEGROUP.

### US-3: Ayuda en cada campo

Como usuario que recién empieza a importar, quiero entender qué me pide cada
campo sin salir de la pantalla.

**Acceptance criteria:**

- WHEN se muestra un campo de carga de cualquiera de las dos calculadoras THE
  SYSTEM SHALL mostrar debajo una ayuda de una o dos líneas: qué es, de dónde
  se saca (factura, packing list, balanza) y un ejemplo.
- La ayuda SHALL estar asociada al campo para lectores de pantalla
  (`aria-describedby`, que ya arma `TextField` con `hint`).
- THE SYSTEM SHALL explicar también los conceptos del resultado que el
  usuario no conoce: TN/m³, CIF, DIE/TE, percepciones recuperables, peso
  volumétrico y consolidado vs. full.
- SHALL leerse bien en mobile (375 px).

### US-4: Errores conocidos corregidos

**Acceptance criteria:**

- **B12-01/B12-02:** el PDF y el desglose SHALL NOT mostrar un "0" suelto
  cuando un valor numérico es 0.
- **B12-03:** buscar "constructor" (o "constructores") SHALL buscar normal,
  sin error.
- **B12-09:** las llamadas de la IA SHALL NOT poder quedar cortadas porque el
  thinking se come el `max_tokens`.
- **B12-10:** el mensaje de formato no soportado SHALL nombrar los formatos
  que de verdad se aceptan.

### US-5: QA documentado y automatizado

**Acceptance criteria:**

- Hay un checklist de QA (en `tasks-vgrp69.md`) con cada flujo marcado OK o
  con su bug anotado en `bugs.md`.
- Los endpoints de IA tienen tests de 401/403/400/413/502 y del caso ok.
- El E2E de la calculadora (`e2e/calculadora.spec.ts`) cubre courier y
  marítimo, con la IA mockeada.

## Constraints

- **Presupuesto de bundle:** `/calculadora/[variante]` tiene 205 kB de
  presupuesto en CI y hoy mide ~202 kB (B12-14 y `docs/RENDIMIENTO.md`). La
  ayuda del courier va en el chunk estático: hay que medir con `pnpm build`
  antes y después.
- La página sigue siendo **estática** (SSG con `revalidate = 3600`).
- Sistema visual Liquid Glass; si hace falta un componente nuevo de info,
  pasa por `/design-system`.

## Open questions

1. **¿Courier integral suma "Descargar PDF"?** Hoy no lo tiene. Propuesta:
   **no en este ticket** (necesita una hoja nueva: `QuoteDoc` está armado
   para el régimen con aranceles). Se anota como pendiente.
2. **Pie del PDF:** el de VEGROUP tenía mail e Instagram. Propuesta: queda
   solo "OG Circle" y el WhatsApp de la config hasta que el equipo pase el
   mail y la cuenta de Instagram oficiales.
3. **Ciudades del pie del PDF courier** ("Miami · Barcelona · Guangzhou ·
   Buenos Aires"): son los depósitos del partner. Propuesta: se mantienen,
   porque son datos operativos y no marca.
