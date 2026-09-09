# Tasks: VGRP-30 — Gating de contenido por nivel

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-09
**Design:** [design-vgrp30.md](./design-vgrp30.md)
**Requirements:** [requirements-vgrp30.md](./requirements-vgrp30.md)

Misma rama que VGRP-27 (`bloque-7/vgrp-27-shell-dashboard`) — a decidir si se separa en su
propia rama antes de la PR, dado que el bloque los trata como tickets independientes.

- [x] **30-T1 — `lib/data/secretos.ts` (`resolverSecreto`) + tests**
  Satisfies: US-2, US-3
  Notes: `server-only`. Reusa `hasNivel()` de `lib/auth/claims.ts` (VGRP-16) — no
  reimplementa el orden de niveles. 8 tests en `secretos.test.ts` cubren la matriz
  nivel-usuario × nivel-mínimo + el caso `claims = null`.

- [x] **30-T2 — `components/ui/ContenidoBloqueado.tsx` + CSS + export en `components/ui/index.ts`**
  Satisfies: US-1
  Notes: Presentacional puro, `bloqueado` llega calculado por el caller. CTA reutiliza
  las clases de `Button` vía `<NextLink>` (mismo criterio que
  `app/(app)/dashboard/page.tsx`, VGRP-22 — nunca `<button>` anidado en `<a>`).

- [x] **30-T3 — Contenido de demostración (`content/agentes-demo.ts`)**
  Satisfies: (soporte de US-3, decisión confirmada con el usuario)
  Notes: 2 agentes de mentira, `server-only`, split `publicMeta`/`secret` explícito.
  **Temporal** — se borra entero cuando VGRP-38 cree la tabla `agentes` real.

- [x] **30-T4 — `GET /api/demo/agentes` (Route Handler dinámico)**
  Satisfies: US-3, US-4 (parcial — ver Non-goals sobre RLS, todavía no aplica)
  Depends on: 30-T1, 30-T3
  Notes: Lee la sesión REAL con `getVerifiedClaims()` en cada request — nunca el nivel de
  `[variante]` (ver el hallazgo de seguridad de abajo). Devuelve `publicMeta` siempre,
  `contacto` sólo vía `resolverSecreto()`.

- [x] **30-T5 — `components/inicio/AgentesDemo.tsx` + punto de extensión en `SeccionSlot`/`InicioShell`**
  Satisfies: US-1, US-3
  Depends on: 30-T2, 30-T4
  Notes: Client Component, fetch de cliente (mismo patrón que `UserFooter`/VGRP-27).
  `SeccionSlot` ganó un prop `children` opcional (ya estaba comentado como punto de
  extensión desde VGRP-27) para poder reemplazar la grilla fantasma del slot de agentes.
  **Bug propio encontrado y corregido durante la verificación manual:** la primera
  versión envolvía la card ENTERA (nombre + especialidad + contacto) en
  `<ContenidoBloqueado>`, así que bloqueado tapaba también el `publicMeta` — contradice
  US-3 explícitamente ("la metadata pública... se puede mostrar bloqueada"). Corregido:
  sólo el `<p>` del contacto queda adentro de `<ContenidoBloqueado>`; nombre y
  especialidad se renderizan siempre.

- [x] **30-T6 — Verificación manual de seguridad de punta a punta**
  ESTADO: verificado en el navegador, con la red inspeccionada (no sólo la UI):
  - Login Principiante → `GET /api/demo/agentes` devuelve `contacto: null` para Li Mei
    (requiere avanzado) — **confirmado en el body de la respuesta real**, no sólo oculto
    por CSS.
  - **Intento de bypass**: logueado como Principiante, navegar a mano a
    `/dashboard/avanzado` (la variante estática de Avanzado) — el fetch a
    `/api/demo/agentes` sigue devolviendo `contacto: null` y `nivelActual: "principiante"`.
    Confirma que el candado depende de la sesión real, nunca del segmento de URL — el
    riesgo que el propio design.md de VGRP-27 había marcado como abierto queda cerrado
    para este caso.
  - Login Avanzado → ambos agentes muestran su contacto real.

- [x] **30-T8 — (seguimiento, 2026-09-09) Migrar `AgentesDemo` a la tabla real `agentes`**
  Depends on: VGRP-38 (tabla `agentes` + CRUD)
  Notes: reemplazo completo de 30-T3/30-T4/30-T5 ahora que la tabla real existe (por
  decisión explícita de VGRP-38, este paso quedaba para después — ver
  requirements-vgrp38.md, Non-goals). `content/agentes-demo.ts` borrado entero.
  - `lib/data/agentes.ts` (nuevo, `server-only`) — `obtenerAgentes(admin, claims)`,
    mismo mecanismo de siempre (`resolverSecreto()`), ahora leyendo `agentes` real
    (`activo=true`, orden por `orden`) en vez del array estático. 5 tests de integración
    (`agentes.test.ts`), incluido el chequeo de que el string del contacto no aparece ni
    serializado en la respuesta cuando está bloqueado.
  - `app/api/agentes/route.ts` reemplaza `app/api/demo/agentes/route.ts` (borrado, junto
    con el directorio `app/api/demo/` que quedó vacío). Mismo patrón: dinámico,
    `getVerifiedClaims()` por request.
  - `components/inicio/AgentesGrid.tsx` reemplaza `AgentesDemo.tsx` (borrado) — mismo
    componente, nombre actualizado porque ya no es contenido de demostración; fetch a
    `/api/agentes`. Se agregó un estado vacío ("Todavía no hay agentes cargados.") para
    cuando la tabla no tiene filas activas todavía (hoy: 0, por decisión de VGRP-38 de no
    inventar los 6 agentes reales).
  - **Revisión independiente** (segundo par de ojos, agente fresco sin contexto de la
    implementación): repasó `secretos.ts`, `claims.ts`, `server.ts`, `middleware.ts`,
    `ContenidoBloqueado.tsx`, la migración de RLS, `videos.ts` (para comparar el criterio
    de gating dinámico vs. estático) y el código nuevo de arriba. **Sin hallazgos** — el
    secreto nunca puede llegar al HTML estático de `/dashboard/[variante]` (sólo se lee
    desde el Route Handler dinámico), los claims siempre se verifican en el momento de la
    request, la RLS de `agentes` es una segunda barrera consistente con la de la app, y no
    hay fuga por logs/errores.
  - **Verificado en el navegador** (no sólo con tests): admin creó un agente real con
    `nivel_requerido=avanzado`; logueado como Principiante, la card mostró
    nombre/especialidad igual, "Disponible desde nivel Avanzado" y el CTA de mejorar
    nivel — y el `GET /api/agentes` real (inspeccionado en Network) devolvió
    `"contacto":null`, sin rastro del string secreto en ningún lado de la respuesta ni
    del HTML. Agente de prueba borrado al terminar.
  - `pnpm typecheck` ✅, `pnpm lint` ✅.

- [ ] **30-T7 — Cierre: `/simplify`, `/design-critique`, decisión de rama, PR**
  Depends on: 30-T1..30-T6, 30-T8
  ESTADO: `pnpm typecheck` ✅, `pnpm lint` ✅, Vitest (`secretos.test.ts` +
  `claims.test.ts` + `middleware.test.ts` + `agentes.test.ts`) ✅. `/simplify` y
  `/design-critique` siguen sin estar disponibles en esta sesión (mismo hallazgo de
  VGRP-27) — no son comandos ni skills existentes en este entorno, no sólo "no
  ejecutados" (confirmado el 2026-09-09: no hay `.claude/commands/` en el repo, y no
  figuran en el listado de skills habilitadas). La revisión de 2 personas que el bloque
  pide para este ticket puntual se hizo como una revisión independiente por un agente
  sin contexto previo (ver 30-T8) — sin hallazgos; falta decidir si VGRP-30 va en la
  misma PR que VGRP-27 o en una propia.
