# Requirements: VGRP-30 — Gating de contenido por nivel (visual y de servidor)

**Status:** Draft
**Last updated:** 2026-09-09

## Summary

La pieza de más riesgo del Bloque 7: los contactos de los 6 agentes de compra y los
datos de SWIFT **son el producto que se vende** (CONTEXT.md §1). Si un usuario
Principiante puede leerlos — en el HTML, en el bundle de JS, o pegándole directo a la
API de Supabase — se regaló gratis lo que Avanzado paga $50.000 más por tener.

Este ticket construye el **mecanismo reutilizable** que toda sección futura (VGRP-29 en
adelante) va a usar para bloquear contenido por nivel: un componente visual de bloqueo,
un helper de entitlement (¿este nivel accede a esto?), y la convención de separar
`publicMeta` (mostrable siempre, aunque esté bloqueado) de `secret` (nunca sale del
servidor si no corresponde). No construye contenido real — eso es VGRP-38 (tablas) y
VGRP-29 (grillas).

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-30** — Gating de contenido por nivel (visual y de servidor).

## Goals

- Un componente de bloqueo reutilizable que muestra contenido restringido en estado
  bloqueado, indicando qué nivel lo desbloquea, con CTA de compra o upgrade.
- Un helper de entitlement que resuelve "¿este nivel accede a esto?" leyendo el claim
  del JWT — **cero queries, cero llamada a Auth** (el mismo criterio ya establecido por
  `hasNivel()` en `lib/auth/claims.ts`, VGRP-16).
- La convención `publicMeta` / `secret` para cualquier contenido futuro: la metadata
  pública (nombre, especialidad) se puede mostrar bloqueada; el secreto nunca sale del
  servidor para quien no tiene el nivel.
- `import 'server-only'` en todo archivo que toque un secreto — regla dura de
  `STACK.md` §3, no es estilo.
- Tests de Vitest sobre el cálculo de entitlement por nivel.

## Non-goals

- **Contenido real** (agentes, videos, profesionales, servicios en base de datos) — es
  VGRP-38. Este ticket no crea esas tablas.
- **Las grillas de Stage 1/2 y el VideoProvider** — es VGRP-29. Además, por nota
  explícita de ese mismo ticket, **los videos no llevan gating de nivel** (la formación
  completa es igual para Principiante y Avanzado — PRD §1.1, confirmado con cita textual
  en una sesión anterior). Este ticket no aplica candado a Stage 1/2.
- **Definir qué agentes/servicios específicos requieren qué nivel** — ver Open questions:
  es una decisión de negocio (de Jota), no técnica.
- **Revisar/tocar las políticas RLS existentes** de `profiles`/`pagos` — ya están
  resueltas (VGRP-15). Este ticket puede necesitar RLS nueva sólo si VGRP-38 ya hubiera
  creado tablas de contenido, y no las creó todavía.

## User stories

### US-1: Componente de bloqueo reutilizable

Como usuario sin el nivel necesario, quiero ver que una sección existe y qué nivel la
desbloquea, en vez de que desaparezca sin explicación.

**Acceptance criteria:**

- THE SYSTEM SHALL exponer un componente (`components/ui/ContenidoBloqueado.tsx` o
  similar) que reciba el nivel mínimo requerido y renderice el contenido normal si el
  usuario tiene entitlement, o un estado bloqueado si no.
- WHEN el contenido está bloqueado THE SYSTEM SHALL mostrar qué nivel lo desbloquea y un
  CTA de compra (`nivel` actual `'ninguno'`) o de upgrade (`nivel` actual insuficiente
  pero no `'ninguno'`).
- THE SYSTEM SHALL NUNCA ocultar una sección sin explicación — contenido bloqueado se ve,
  no desaparece (PRD §6, criterio de aceptación global).
- WHEN el nivel del usuario es `'ninguno'` THE SYSTEM SHALL mostrar todas las secciones
  gateadas como bloqueadas con el CTA de compra, de forma que la pantalla se vea
  intencional, no rota (PRD §3.3 / §6).

### US-2: Helper de entitlement — cero costo

Como sistema, quiero decidir si un nivel accede a un contenido sin pagar el costo de una
consulta a la base ni a Auth, para que el gating no degrade el rendimiento del shell
estático.

**Acceptance criteria:**

- THE SYSTEM SHALL resolver "¿tiene este nivel acceso a esto?" leyendo únicamente el
  claim `app_metadata.nivel` del JWT ya verificado — reutilizando `hasNivel()` /
  `getNivel()` de `lib/auth/claims.ts` (VGRP-16), sin reimplementar el orden
  `ninguno < principiante < avanzado`.
- THE SYSTEM SHALL NOT ejecutar ninguna query a Supabase ni llamada a
  `supabase.auth.getUser()` para resolver el entitlement de una sección.
- THE SYSTEM SHALL tener tests de Vitest que cubran las 3×2 combinaciones relevantes
  (nivel del usuario × nivel requerido) del cálculo de entitlement.

### US-3: Split `publicMeta` / `secret` — el secreto nunca sale del servidor

Como responsable del producto, quiero que el dato que se vende (contacto de agente,
SWIFT) nunca llegue al HTML ni al bundle de un usuario sin el nivel correspondiente, ni
siquiera dentro de un `<script>` de hidratación oculto por CSS.

**Acceptance criteria:**

- THE SYSTEM SHALL definir la forma de cualquier contenido futuro con dos partes
  explícitas: `publicMeta` (seguro de mostrar siempre, ej. nombre/especialidad) y
  `secret` (contacto, `provider_ref`, datos SWIFT — nunca se serializa para un usuario
  sin el nivel).
- THE SYSTEM SHALL resolver el `secret` únicamente en un contexto de servidor
  (`server-only`) que verifique el entitlement ANTES de leer o devolver el secreto —
  nunca "lee y después oculta con CSS/JS".
- IF un usuario sin el nivel necesario inspecciona el HTML servido o el bundle de JS
  THEN no debe encontrarse ningún valor de `secret` de una sección a la que no tiene
  acceso — verificable a mano (PRD §6) y con al menos un test que lo confirme.
- THE SYSTEM SHALL marcar con `import 'server-only'` (primera línea) todo archivo que
  declare, lea o transporte un valor de tipo `secret`.

### US-4: Red de seguridad en la base (RLS)

Como responsable del producto, quiero que aunque un bug de UI mostrara de más, una
consulta directa a la API de Supabase con el token de un Principiante siga sin poder leer
contenido de Avanzado.

**Acceptance criteria:**

- WHEN exista una tabla de contenido con secretos (VGRP-38, todavía no creada) THE SYSTEM
  SHALL requerir que su policy de RLS filtre por nivel del claim (`auth.jwt() ->
  'app_metadata' ->> 'nivel'`), nunca sólo confiar en que el frontend no la muestre.
- Este ticket documenta la regla (para que VGRP-38 la aplique) — no hay tabla propia que
  gatear todavía; ver Non-goals.

## Constraints

- **Stack fijo:** TypeScript estricto, sin librerías nuevas. Reutiliza
  `lib/auth/claims.ts` (`hasNivel`, `getNivel`) — no se reimplementa el orden de niveles
  en un segundo lugar.
- **Regla dura de bundle (STACK.md §3):** todo archivo con un `secret` arranca con
  `import 'server-only'`. No es estilo — es lo que impide que un `'use client'` mal
  puesto publique el producto entero.
- **Gating por claim, no por query:** mismo criterio ya aplicado en `middleware.ts` y
  `lib/auth/admin.ts` — `getVerifiedClaims()`/claim del JWT, nunca `getUser()` ni
  subquery a `profiles`.
- **CSS Modules, tokens de `app/tokens.css`** para el componente de bloqueo — consistente
  con el resto de `components/ui/`.
- **Reutilización obligatoria:** el componente de bloqueo va en `components/ui/` (no en
  `components/inicio/`), porque VGRP-29 y futuras secciones también lo van a consumir.

## Open questions

- **¿Contra qué contenido se demuestra/testea el mecanismo, si VGRP-38 (las tablas) va
  DESPUÉS en la cadena?** El propio STACK.md §12 (orden de ejecución original, ítem 10)
  preveía `content/*.ts` tipado con el split `publicMeta`/`secret` como paso intermedio
  antes de que VGRP-38 decidiera mover todo a base de datos. Propuesta de esta versión
  del spec: crear un módulo de contenido de EJEMPLO mínimo (`content/agentes-demo.ts` o
  similar, 1-2 agentes de mentira, claramente comentado como temporal) sólo para poder
  construir y testear el componente de bloqueo + el split publicMeta/secret de punta a
  punta. VGRP-38 lo reemplaza enteramente por la tabla real — no es contenido que se vaya
  a mostrar a usuarios de verdad todavía (no hay ningún slot de VGRP-27 que lo consuma
  por defecto). A confirmar antes de escribir código — es una decisión de alcance, no
  técnica.
- **Qué agentes/servicios específicos requieren qué nivel** — CONTEXT.md §3 sólo dice que
  Avanzado agrega "agente de muestras y de volumen"; no está claro si eso significa que
  los otros agentes (¿4 de los 6?) son visibles para Principiante con contacto incluido,
  o si TODOS los agentes son Avanzado-only y Principiante sólo ve el directorio
  bloqueado. Esto lo define Jota — VGRP-38 es quien carga los datos reales con su
  `nivel_requerido` por fila, así que no bloquea empezar VGRP-30 (el mecanismo es
  agnóstico a esa decisión), pero sí bloquearía cargar contenido real después.
