# Tasks: VGRP-27 — Shell del dashboard y navegación por drawer

**Status:** In Progress
**Last updated:** 2026-09-08
**Design:** [design.md](./design.md)
**Requirements:** [requirements.md](./requirements.md)

Rama: `bloque-7/vgrp-27-shell-dashboard` (desde `main`). Una PR al final. Tareas en orden de
dependencia: primero los datos compartidos (destinos del drawer), después el shell visual
(header/drawer/slots), después el mecanismo de las 2 variantes prerenderizadas
(middleware + ruta `[variante]`), con los tests al lado de lo que verifican.

- [x] **27-T1 — `components/nav/destinos.ts`: fuente única de los 5 destinos**
  Satisfies: US-2
  Notes: `DestinoNav { href, label, proximamente? }`. Comunidad y Tracking con
  `proximamente: true`. Sin lógica, sólo datos — lo consumen el drawer y (más adelante)
  cualquier otro lugar que necesite la lista.

- [x] **27-T2 — `components/nav/NavDrawer.tsx` + `nav.module.css`**
  Satisfies: US-2
  Depends on: 27-T1
  Notes: Client Component. `createPortal` al body. `role="dialog"` + `aria-modal="true"` +
  `aria-label="Navegación"`. Foco al primer link al abrir, loop de Tab/Shift+Tab dentro del
  drawer, Escape cierra y devuelve el foco al botón que abrió, click en overlay cierra,
  `overflow: hidden` en `<body>` mientras está abierto. Destinos `proximamente` se
  renderizan como elemento no navegable con badge "Próximamente" (nunca `<a href>` a una
  ruta que no existe). Estilo con tokens de `app/tokens.css` (superficie de vidrio,
  acento ámbar en el destino activo).

- [x] **27-T3 — `components/nav/DashboardHeader.tsx`**
  Satisfies: US-1
  Depends on: 27-T2
  Notes: Client Component chico: botón hamburguesa (ícono de `lucide-react`, ya en el
  repo) + estado `abierto` + monta `<NavDrawer>`. Sin fetching de datos — por eso puede
  vivir dentro de `app/(app)/layout.tsx` (Server Component estático) sin volverlo dinámico.

- [x] **27-T4 — Montar `DashboardHeader` en `app/(app)/layout.tsx`**
  Satisfies: US-1
  Depends on: 27-T3
  Notes: Sólo agregar `<DashboardHeader />` arriba de `{children}`. No tocar el resto del
  archivo — sigue sin leer cookies ni claims (ver el comentario ya existente ahí).

- [x] **27-T5 — `components/inicio/SeccionSlot.tsx` + `InicioShell.tsx`**
  Satisfies: US-3
  Notes: `InicioShell` arma los 7 slots en el orden de MODULOS.md §2 (Stage 1, banner
  calculadora, Stage 2, agentes, banner comunidad, profesionales, servicios financieros).
  `SeccionSlot` es el placeholder individual (título + copy corto + estado visual "en
  construcción"). Comentario marcando el punto exacto donde VGRP-30 va a envolver cada
  slot (mismo estilo que el comentario de VGRP-27/30 en `app/(app)/layout.tsx`).

- [x] **27-T6 — `app/(app)/dashboard/[variante]/page.tsx`**
  Satisfies: US-4
  Depends on: 27-T5
  Notes: `generateStaticParams()` → `["principiante", "avanzado"]`, `dynamicParams = false`.
  Cero `cookies()` / `getVerifiedClaims()` en este archivo — el nivel llega por `params`,
  no por sesión (ver design.md, "Interfaces / contracts"). Renderiza `<InicioShell />`.

- [x] **27-T7 — Diff de `middleware.ts`: rewrite de `/dashboard` según nivel**
  Satisfies: US-4
  Depends on: 27-T6
  Notes: Después del bloque de rol de VGRP-35, antes del `return response` final: si
  `pathname === "/dashboard"` y `haySesion`, leer `getNivel(claims)`; si es `principiante`
  o `avanzado`, `NextResponse.rewrite` a `/dashboard/${nivel}` envuelto en
  `withRefreshedCookies`. Si es `ninguno`, sigue de largo (sin rewrite) a la página
  existente de VGRP-18. Ver diff conceptual exacto en design.md.

- [x] **27-T8 — Tests de `middleware.test.ts`**
  Satisfies: US-4
  Depends on: 27-T7
  Notes: Casos: sin sesión → sigue a `/login` (sin cambios de comportamiento existente);
  sesión + `ninguno` → sin rewrite, llega a `/dashboard` tal cual; sesión + `principiante`
  → rewrite a `/dashboard/principiante`; sesión + `avanzado` → rewrite a
  `/dashboard/avanzado`. No romper ningún test existente del archivo.

- [x] **27-T9 — (descartada) Test de accesibilidad del drawer con Vitest + Testing Library**
  ESTADO: **no viable tal cual estaba planificada.** `vitest.config.ts` corre en
  `environment: "node"` (sin DOM) y el repo no tiene `@testing-library/react` ni `jsdom`
  instalados — agregarlos es sumar una librería nueva sin decisión explícita (constraint
  dura de requirements.md). El patrón real que ya usa este repo para accesibilidad de UI es
  Playwright (`e2e/registro-login-dashboard.spec.ts`, `e2e/admin-acceso.spec.ts`), no
  Vitest+RTL. La verificación de foco atrapado/Escape/ARIA del drawer se cubre en 27-T10.

- [x] **27-T10 — E2E `e2e/dashboard-shell.spec.ts`**
  Satisfies: US-1, US-2, US-3, US-4
  Depends on: 27-T7
  ESTADO (2026-09-08): **escrito y corrido de verdad** contra `pnpm build && pnpm start`
  (webServer real de `playwright.config.ts`), con `SUPABASE_SERVICE_ROLE_KEY` ya
  configurada. 4 tests: las 2 variantes por nivel llegan a `/dashboard` con sesión real;
  el drawer abre con teclado, atrapa el foco, marca Comunidad/Tracking como "Próximamente"
  (no links), y Escape devuelve el foco; el pie del drawer muestra el email/nombre y
  "Cerrar sesión" termina la sesión de verdad (confirmado que `/dashboard` vuelve a pedir
  login después). Los 4 pasan corriendo el archivo solo.
  **HALLAZGO REAL corriendo este E2E** (no hipotético — encontrado y arreglado en esta
  misma tarea): el overlay del drawer tenía `aria-hidden="true"` con el `role="dialog"`
  anidado ADENTRO — eso saca todo el subárbol (diálogo incluido) del árbol de
  accesibilidad. Un test manual con clicks/JS no lo detecta (el DOM está ahí), pero
  Playwright's `getByRole` (igual que un lector de pantalla real) no encontraba el
  diálogo. Arreglado en `NavDrawer.tsx`: overlay y panel pasaron a ser HERMANOS (no
  padre-hijo) — el overlay decorativo conserva `aria-hidden`, el diálogo ya no queda
  adentro. Esto habría sido un bug de accesibilidad real e invisible sin este E2E.
  De paso se corrigió `e2e/pago-aprobado-acceso.spec.ts` (test preexistente, no de este
  ticket): esperaba el texto viejo "Tenés acceso {nivel}" de VGRP-18, que este ticket
  reemplaza por el heading "Nivel {variante}" para usuarios con nivel pago — actualizado
  para reflejar la UI real y nueva.
  NOTA sobre la corrida completa (`pnpm test:e2e`, 21 archivos): el test de logout de
  este archivo dio timeout una vez corriendo DETRÁS de otros 7 tests en la misma suite —
  coincide con la limitación de entorno ya documentada en `vitest.config.ts`/`docs/
  TESTING.md` (sin base de test separada, muchos logins seguidos contra el mismo proyecto
  real disparan el rate limit nativo de Supabase Auth). No es un bug de este ticket ni de
  este archivo — corriendo sólo `e2e/dashboard-shell.spec.ts` los 4 tests pasan siempre.

- [ ] **27-T11 — Cierre: `/simplify`, `/design-critique`, PR**
  Depends on: 27-T1..27-T10
  ESTADO (2026-09-08): `pnpm typecheck` ✅, `pnpm lint` (biome) ✅, `pnpm build` ✅ — **build
  confirma `/dashboard/[variante]` como `● (SSG)`** con `/dashboard/principiante` y
  `/dashboard/avanzado` listados, prerenderizados de verdad (no una suposición de diseño).
  `pnpm test` (Vitest): 200 passed / 1 failed / 1 todo — el único fallo y los 14 archivos
  que ni corren son preexistentes (`SUPABASE_SERVICE_ROLE_KEY` ausente, no relacionados a
  este ticket, mismo resultado antes de tocar nada). Verificado a mano en el navegador con
  los 4 usuarios seed: login real, rewrite confirmado por network tab (URL se mantiene
  `/dashboard`, target interno cambia), foco atrapado y ciclo completo de Tab confirmado,
  Escape devuelve el foco al trigger, responsive mobile ok, sin errores de consola.
  PENDIENTE: `/simplify` y `/design-critique` **no están disponibles en esta sesión**
  (no son skills instaladas ni comandos en `.claude/commands/` — mismo hallazgo que ya se
  había marcado al arrancar el ticket). Abrir la PR queda pendiente de confirmación
  explícita del usuario antes de comitear/pushear.
