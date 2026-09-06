# Requirements: Bloque 5 — Panel de administración base ("Red de seguridad operativa")

**Status:** Approved
**Last updated:** 2026-09-05

## Summary

El panel de administración mínimo que le permite al equipo reparar a mano lo que el
flujo automático de cobro no resolvió: proteger `/admin` por rol, auditar toda acción
sensible, gestionar usuarios y activar/cambiar su nivel manualmente, y ver el ledger de
pagos con la posibilidad de reprocesar un pago aprobado que no se aplicó.

Cubre 3 work items del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-35** — Panel admin: rol, protección de rutas y audit log.
- **VGRP-36** — Panel admin: gestión de usuarios y activación manual de nivel.
- **VGRP-37** — Panel admin: ledger de pagos y reproceso de webhook.

Audiencia: exclusivamente los admins del equipo (hoy 1–3 personas). No es una superficie
de usuario final.

## Goals

- Que un miembro del equipo con `rol = 'admin'` pueda entrar a `/admin` y que nadie más
  pueda, sin que verificar el rol cueste una query.
- Que "alguien pagó y no tiene acceso" — el peor bug del sistema (PRD §3.8) — se pueda
  diagnosticar y reparar desde una pantalla, sin tocar la base a mano.
- Que toda acción de admin que cambie el nivel de alguien o reprocese un pago quede
  registrada de forma inmutable (actor, entidad, valor anterior, valor nuevo, timestamp).
- Que la activación manual de nivel reutilice exactamente la misma proyección
  `pagos → nivel` que usa el webhook (`proyectarNivel` en `lib/data/pagos.ts`), sin
  reimplementar la lógica de negocio.
- Que la lógica de activación manual no asuma que siempre hay un pago de Mercado Pago
  asociado (prepara el terreno para transferencia / USDT de Fase 3).

## Non-goals

- **CRUD de contenido** (agentes, videos, profesionales, servicios) — es VGRP-38, Bloque 6.
- **Gestión de precios y flags de fase** (`/admin/config`, Edge Config) — es VGRP-40, Bloque 7.
- **Lectura del audit log como pantalla dedicada con su ruta `/admin/audit`** más allá de
  lo que pide VGRP-35: VGRP-35 pide *una* pantalla de lectura del audit log con filtro por
  actor y por fecha; eso entra. El endpoint `GET /admin/audit` del PRD §5.3 se implementa
  en la medida en que esa pantalla lo necesita, no como API pública aparte.
- **Crear, promover o invitar admins** desde la aplicación. Decisión cerrada: el rol se
  asigna por SQL directo sobre `profiles.rol`. No se construye ninguna pantalla, endpoint
  ni seed automático.
- **Definir qué le pasa al nivel de un usuario cuando un pago pasa a `refunded`** — sigue
  siendo decisión abierta del PRD §8. En este bloque los pagos `refunded` se muestran en el
  ledger pero no disparan ninguna revocación automática de nivel.
- **Revocar / bajar el nivel a `ninguno` como flujo destacado** — la activación manual
  puede setear cualquier nivel del enum, incluido `ninguno`, pero no hay un botón especial
  de "revocar acceso" ni lógica de reembolso.
- **Notificaciones al usuario** cuando un admin le cambia el nivel (no se dispara email).
- **Paginación con cursor infinito, exportación a CSV, gráficos o métricas de negocio** —
  eso es el dashboard de métricas de Fase 3+.
- **OAuth / 2FA reforzado para admins** — el admin entra con el mismo login de email y
  contraseña del Bloque 2; el refuerzo de identidad de admin no es parte de este bloque.

## User stories

### US-1: Protección de las rutas de `/admin` por rol

Como admin del equipo, quiero que `/admin` y todo lo que cuelga de esa ruta sólo sea
alcanzable con `rol = 'admin'` en mi token, para que el panel — que puede regalar acceso
pago — no quede expuesto a usuarios comunes ni a visitantes anónimos.

**Acceptance criteria:**

- WHEN un request llega a cualquier ruta bajo `/admin` (página o endpoint) THE SYSTEM
  SHALL verificar `rol = 'admin'` leyéndolo del claim `app_metadata.rol` del JWT ya
  verificado localmente, sin ninguna query a la base ni a Auth.
- IF el request a una ruta bajo `/admin` no tiene sesión THEN THE SYSTEM SHALL redirigir a
  `/login` preservando el destino en `next` (páginas) o responder `401` (rutas `/api`),
  igual que el resto del middleware fail-closed existente.
- IF el request a una **página** bajo `/admin` tiene sesión válida pero `rol != 'admin'`
  THEN THE SYSTEM SHALL responder con `404` (o un redirect que no revele que la ruta
  existe) — nunca una pantalla parcial de admin y nunca un `403` que confirme la ruta.
- IF el request a un **endpoint** (`/api` o Server Action) bajo el área de admin tiene
  sesión válida pero `rol != 'admin'` THEN THE SYSTEM SHALL responder `404` o el error
  genérico equivalente, sin ejecutar ninguna lógica de negocio.
- THE SYSTEM SHALL renderizar el área de `/admin` con un layout propio, separado del layout
  de `(app)`.
- WHEN el `rol` de un usuario cambia en la base THE SYSTEM SHALL reflejar el nuevo valor en
  su claim en la siguiente renovación de sesión (comportamiento heredado del Auth Hook,
  no se re-implementa acá — sólo se verifica que el panel no dependa de otra cosa).
- THE SYSTEM SHALL NOT exponer ninguna ruta, endpoint, formulario o Server Action que cree,
  promueva o invite admins.

### US-2: Audit log de toda mutación del panel

Como responsable del sistema, quiero que cada acción de admin que cambie datos quede
registrada de forma inmutable, para poder reconstruir después quién hizo qué y con qué
valores.

**Acceptance criteria:**

- WHEN una mutación del panel se completa con éxito (cambio de nivel de un usuario,
  reproceso de un pago, o cualquier futura mutación de admin) THE SYSTEM SHALL escribir una
  fila en `admin_audit_log` con: `actor_id` (el admin), `accion`, `entidad`, `entidad_id`,
  `valor_anterior` y `valor_nuevo`.
- THE SYSTEM SHALL exponer un único helper de escritura del audit log que toda mutación del
  panel está obligada a usar (no se escribe la tabla ad-hoc desde cada handler).
- THE SYSTEM SHALL escribir `admin_audit_log` únicamente con el cliente de service role
  desde el backend; no existe endpoint de escritura ni de borrado del audit log expuesto a
  ningún cliente.
- IF la mutación de negocio falla THEN THE SYSTEM SHALL NOT escribir una fila de audit log
  para esa acción (no se auditan intentos fallidos en este bloque).
- WHEN un admin abre la pantalla de auditoría THE SYSTEM SHALL listar las filas de
  `admin_audit_log` ordenadas de más reciente a más antigua, con filtro por actor y por
  rango de fechas, y con paginación que no traiga toda la tabla a memoria.
- THE SYSTEM SHALL mostrar el audit log como sólo lectura: la pantalla no ofrece editar ni
  borrar filas.

### US-3: Listado y detalle de usuarios

Como admin, quiero buscar un usuario por email y ver su ficha completa (datos, nivel
activo, historial de pagos, progreso), para entender su situación antes de tocar nada.

**Acceptance criteria:**

- WHEN un admin abre `/admin/usuarios` THE SYSTEM SHALL mostrar un listado de usuarios con
  búsqueda por email (coincidencia parcial), filtro por nivel y paginación.
- THE SYSTEM SHALL resolver el listado con paginación del lado de la base (limit/offset o
  keyset), sin traer todos los usuarios a memoria.
- WHEN un admin abre `/admin/usuarios/:id` THE SYSTEM SHALL mostrar los datos del usuario,
  su nivel activo, su historial de pagos (el ledger completo de ese usuario) y su
  `progreso`.
- IF el `:id` no corresponde a ningún usuario THEN THE SYSTEM SHALL responder `404`.
- THE SYSTEM SHALL validar los parámetros de búsqueda, filtro y paginación con Zod, y
  rechazar entrada inválida con `400`.
- THE SYSTEM SHALL NOT incluir en la respuesta de la búsqueda datos de usuarios distintos
  de los que matchean el criterio (la búsqueda por email no filtra en cliente).

### US-4: Activación / cambio manual de nivel

Como admin, quiero activar o cambiar el nivel de un usuario a mano indicando un motivo,
para poder darle el acceso que pagó cuando el flujo automático no lo hizo.

**Acceptance criteria:**

- WHEN un admin envía `POST /admin/usuarios/:id/nivel` con body `{ nivel, motivo }` válido
  THE SYSTEM SHALL fijar el nivel del usuario reutilizando la misma proyección
  `pagos → nivel` que usa el webhook, de modo que el cambio se refleje en `profiles.nivel`
  y en el claim `app_metadata.nivel` del usuario en su próxima renovación de sesión.
- IF el body no incluye `motivo` (o `motivo` es vacío / sólo espacios) THEN THE SYSTEM
  SHALL rechazar la request con `400` y no cambiar nada.
- IF `nivel` no es un valor del enum `nivel_acceso` THEN THE SYSTEM SHALL rechazar la
  request con `400`.
- WHEN el cambio de nivel se aplica THE SYSTEM SHALL escribir una fila en `admin_audit_log`
  con el `valor_anterior` (nivel previo) y el `valor_nuevo` (nivel nuevo) y el `motivo`.
- IF el `:id` no corresponde a ningún usuario THEN THE SYSTEM SHALL responder `404` y no
  escribir audit log.
- THE SYSTEM SHALL permitir la activación manual aunque el usuario no tenga ningún pago de
  Mercado Pago asociado (la lógica no asume que hay un `pago` de MP detrás).
- WHEN un admin fija el nivel al mismo valor que ya tenía THE SYSTEM SHALL completar la
  operación sin error y de forma idempotente (registrando el audit log con
  `valor_anterior == valor_nuevo`).
- THE SYSTEM SHALL validar todo el body con Zod.

### US-5: Ledger de pagos con detección de pagos sin aplicar

Como admin, quiero ver todos los pagos con filtros y que el sistema me marque solo los
pagos aprobados cuyo nivel no quedó reflejado en el perfil del usuario, para cazar el caso
exacto que hay que reparar sin buscarlo.

**Acceptance criteria:**

- WHEN un admin abre `/admin/pagos` THE SYSTEM SHALL mostrar el ledger de pagos con filtro
  por estado y por rango de fechas, y búsqueda por `proveedor_ref`.
- THE SYSTEM SHALL resaltar en el listado los pagos con `estado = 'approved'` cuyo
  `nivel_comprado` no está reflejado en el nivel vigente del perfil del usuario, sin que el
  admin tenga que filtrar para encontrarlos.
- WHEN un admin abre el detalle de un pago THE SYSTEM SHALL mostrar el `payload_raw` del
  evento para diagnóstico, sin exponer secretos de la integración (tokens, claves, headers
  de firma) en la vista.
- THE SYSTEM SHALL mostrar el ledger como sólo lectura: no hay forma de editar ni borrar un
  pago desde el panel.
- THE SYSTEM SHALL validar los filtros y la paginación con Zod.

### US-6: Reproceso de un pago aprobado

Como admin, quiero reprocesar un pago aprobado que no se aplicó, para que el usuario
obtenga el nivel que pagó sin que yo tenga que tocar la base.

**Acceptance criteria:**

- WHEN un admin envía `POST /admin/pagos/:id/reprocesar` sobre un pago existente THE SYSTEM
  SHALL volver a ejecutar la proyección `pagos → nivel` para el usuario dueño de ese pago,
  usando la misma función que el webhook (no una reimplementación).
- IF el pago ya estaba correctamente aplicado THEN THE SYSTEM SHALL completar el reproceso
  sin duplicar filas de `pagos`, sin romper el estado y sin cambiar el nivel resultante
  (idempotente).
- WHEN un reproceso se ejecuta THE SYSTEM SHALL escribir una fila en `admin_audit_log`
  (`accion = 'reprocesar_pago'`, `entidad = 'pagos'`, `entidad_id = <pago.id>`), con el
  nivel del usuario antes y después.
- IF el `:id` no corresponde a ningún pago THEN THE SYSTEM SHALL responder `404` y no
  escribir audit log.
- IF el pago existe pero su `estado` no es `approved` THEN THE SYSTEM SHALL rechazar el
  reproceso con un error claro (`409` o equivalente) y no cambiar nada.

## Constraints

- **Stack fijo:** Next.js 15 App Router (React 19, TS strict), CSS Modules con los tokens
  de `DESIGN.md` (dark cinematic, sin Tailwind), `@supabase/supabase-js` sin ORM detrás de
  `lib/data/`, Zod para toda validación de entrada. No se agregan librerías que no estén en
  `STACK.md` sin decisión explícita.
- **Gating por claim, no por query:** la verificación de `rol` sigue la regla dura del repo
  (`getClaims()` / claim del JWT, nunca `getUser()` ni subquery a `profiles`). Ver
  `middleware.ts` y `lib/auth/server.ts`.
- **Fail-closed heredado:** el `middleware.ts` actual corre sobre todas las rutas y sólo
  enumera lo público. `/admin` ya queda cubierto por "exige sesión"; este bloque agrega la
  capa de rol encima sin aflojar nada de lo existente.
- **Reutilización obligatoria:** `proyectarNivel` / `insertarPago` de `lib/data/pagos.ts`
  son el punto de entrada compartido con el webhook — la activación manual y el reproceso
  los usan, no los reimplementan (nota del propio archivo y de VGRP-24).
- **Service role sólo en servidor:** las escrituras a `profiles`, `pagos` y
  `admin_audit_log` van por `createServiceRoleClient()` (`lib/supabase/service-role.ts`,
  ya con `import "server-only"`).
- **RLS como red de seguridad:** `admin_audit_log` ya tiene policy de SELECT para
  `rol = 'admin'` en el JWT y grants sólo de lectura para `authenticated`. La migración de
  este bloque no debe debilitar eso.
- **Migraciones:** los cambios de BD de este bloque se aplican con el MCP de Supabase
  (`apply_migration`) y además se versionan como archivo en `supabase/migrations/`.
- **CI en verde:** typecheck + `biome ci` + build + la suite de Vitest/Playwright. Toda
  mutación nueva necesita test de integración (incluido un test de que un no-admin no puede
  usarla y un test de RLS que se ponga en rojo si se desactiva la policy del audit log).
- **Entrega:** una rama + PR por ticket, en orden VGRP-35 → VGRP-36 → VGRP-37 (36 y 37 se
  construyen sobre la base mergeada de 35). Commits y push por Claude Code (hooks de
  review). `/simplify` antes de cada PR; `/design-critique` sobre las pantallas nuevas;
  `/design-system` si se tocan primitivas compartidas de `components/ui`.
- **Criterios de aceptación globales del PRD §6** aplican a cada ticket antes de cerrarlo.

## Open questions

- **Reembolsos (PRD §8):** qué le pasa al nivel cuando un pago pasa a `refunded` sigue sin
  decidirse. Este bloque lo deja fuera (los `refunded` sólo se listan). Si Jota define la
  política antes de implementar, puede que US-5 quiera además resaltar los `refunded` con
  nivel todavía activo — a confirmar, no bloquea empezar.
- **Autorización del MCP de Supabase:** aplicar migraciones necesita que el MCP esté
  autorizado y apuntando al proyecto correcto (región `sa-east-1`). Si no lo está al llegar
  a la implementación, se cae de nuevo a "SQL a mano sin ejecutar" como los bloques
  previos. A verificar al arrancar la fase de tasks.
- **Alta del primer admin para poder probar:** los tests de integración necesitan un
  usuario con `rol = 'admin'`. Hay que confirmar que el seed de tests
  (`test/helpers/seed-users.ts`) puede crear uno, o agregarlo.
