# Testing (VGRP-43)

## Decisión de entorno: mismo proyecto Supabase que la app

Mientras el proyecto no facture, **no hay branch de Supabase ni proyecto
separado para tests** — ambos tienen costo recurrente y no se justifican sin
ingresos (evaluado y descartado explícitamente en el ticket VGRP-43). Los
tests corren contra el **mismo proyecto** que usa la app (`og-circle`,
`docs/SUPABASE-SETUP.md`), que hoy no tiene usuarios pagos ni tráfico real.

Esto es un riesgo aceptado a propósito, no un descuido — y viene con dos
obligaciones no negociables:

1. **Todo dato que un test crea queda identificable.** El mecanismo es el
   dominio de email `@test.og-circle.invalid`
   (`TEST_EMAIL_SUFFIX`/`isTestEmail()` en `test/helpers/seed-users.ts`).
   Cualquier usuario de test — del seed o ad hoc — se crea con ese dominio.
   Nunca crear un usuario de test con otro email.
2. **Limpieza obligatoria.** `test/helpers/cleanup.ts` borra todo lo que
   tenga ese dominio (y sus filas de `pagos`) al final de cada corrida —
   automático, no opcional. Ver más abajo.

**Precaución operativa:** como esto pega contra el proyecto real, evitar
correr la suite completa mientras alguien está probando la app a mano, y
evitar correr tests en paralelo sin coordinar entre compañeros — pueden
pisarse datos entre sí. `playwright.config.ts` ya fuerza `workers: 1` por
esto mismo, y `vitest.config.ts` tiene el equivalente (`fileParallelism:
false`, ver abajo).

**Rate limit nativo de Supabase Auth — no corras la suite completa varias
veces seguidas en poco tiempo.** Descubierto corriendo `pnpm test` repetidas
veces para verificar estabilidad: Supabase Auth tiene su propio rate limit
por proyecto (`429 over_request_rate_limit`), independiente de cualquier cosa
que controlemos nosotros. `test/helpers/with-auth-retry.ts` reintenta con
backoff exponencial en TODO el código de test que llama a
`supabase.auth`/`supabase.auth.admin` (login, alta, borrado, listado,
`generateLink`), así que un rate limit puntual durante una corrida normal se
absorbe solo. Lo que ese retry NO cubre — a propósito — es el código de la
APP bajo test (`app/(auth)/_actions.ts`): agregarle reintentos de rate limit
sería cambiar comportamiento real de producción para acomodar a los tests, lo
cual está mal. Consecuencia: si el proyecto ya viene de mucho volumen de auth
en poco tiempo (varias corridas seguidas de la suite, por ejemplo), una
Server Action real como `iniciarSesion()` puede toparse con el límite sin
reintentar y hacer fallar el test que la ejercita — no es un bug de la
suite, es la misma contención de "proyecto compartido" que ya se acepta en
todo este documento, sólo que a nivel de Supabase Auth y no de datos. Si ves
un test fallar puntualmente con `AuthApiError: Request rate limit reached`
(o un timeout de una Server Action que debería redirigir y no lo hizo), no es
necesariamente un bug: esperá un rato y corré la suite de nuevo.

## Qué hay

- **Vitest** — unit + integración. `pnpm test`. Config en `vitest.config.ts`.
- **Playwright** — E2E, solo Chromium (STACK.md §9). `pnpm test:e2e`. Config
  en `playwright.config.ts`. Los tests viven en `e2e/`.
- **Seed idempotente** de 4 usuarios de test (uno por nivel + admin) en
  `supabase/seed/seed-test-users.ts`. `pnpm db:seed:test`.
- **Limpieza** en `test/helpers/cleanup.ts`:
  - `cleanupUser(userId)` — borra un usuario de test puntual (verifica el
    dominio antes de borrar, aborta si no es de test).
  - `cleanupAllTestArtifacts()` — barrido completo: borra `pagos` y
    `admin_audit_log` de todo usuario de test (incluidos los del seed —
    ambas tablas referencian `profiles` sin `ON DELETE CASCADE`, así que hay
    que vaciarlas antes de poder borrar el usuario) y borra los usuarios de
    test que NO son de los 4 fijos del seed. Corre automáticamente al final
    de `pnpm test` (`test/global-teardown.ts`) y `pnpm test:e2e`
    (`e2e/global-teardown.ts`), y a mano con `pnpm test:cleanup`
    (`scripts/cleanup-test-data.ts`).
- **Helpers** en `test/helpers/`: `db-client.ts` (clientes admin/anon),
  `auth.ts` (`createAuthenticatedUser`, `getTokenWithClaim`), `rls-toggle.ts`
  (`withPolicyDisabled`, ver abajo), `recovery.ts` (`generateRecoveryLink`,
  ver abajo) y `with-auth-retry.ts` (`withAuthRetry`, ver "Rate limit nativo
  de Supabase Auth" más abajo).
- **`NODE_ENV=test` obligatoria** para crear un cliente de test
  (`db-client.ts::assertTestRuntime`): sin esa marca explícita, no se crea
  ni el cliente admin ni el anon. Vitest la setea sola; `test:e2e`,
  `db:seed:test` y `test:cleanup` la fuerzan con `cross-env` en
  `package.json`. Si alguna vez ves el error "se llamaron fuera de un
  contexto de test", falta ese `cross-env` en el script que lo disparó.

No hay guarda de conexión contra un proyecto de producción separado: no
existe tal proyecto hoy (es el mismo `og-circle` para todo), así que no hay
nada contra qué comparar. Si en el futuro se crea uno, la protección real
pasa a ser no compartir sus credenciales con `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` de test — evaluar en ese momento si conviene
reintroducir un chequeo explícito.

## Desactivar una policy de RLS a propósito (VGRP-44)

`test/helpers/rls-toggle.ts::withPolicyDisabled(admin, schema, table, policy, fn)`
resuelve el criterio de VGRP-44 "un test de RLS que pasa con la policy
desactivada es un test roto": borra la policy, corre `fn`, y la recrea
idéntica al terminar (haya salido bien o mal). Usa tres funciones RPC
`security definer` restringidas a `service_role`, aplicadas contra el
proyecto real en `supabase/migrations/20260827161404_test_rls_toggle_helpers.sql`
(ver el comentario largo al inicio de esa migración para el porqué de esas
tres funciones y el análisis de riesgo — verificado con `pg_proc.proacl` que
sólo `postgres`/`service_role` tienen `EXECUTE`, nadie más).

**Aplicada y con tipos regenerados** — `admin.rpc()` en `rls-toggle.ts` ya
está tipado normal contra `lib/database.types.ts`, sin cast manual. Lo único
que falta es probarla de punta a punta contra el proyecto real (crear un
usuario, desactivar una policy con `withPolicyDisabled`, confirmar en
`pg_policies` que desaparece y que vuelve idéntica al final) — eso queda para
cuando se escriban los tests de RLS de VGRP-44 en sí, que es donde esta
verificación tiene sentido (el propio ticket pide hacerlo con al menos dos
policies antes de cerrarlo).

Uso típico dentro de un test:

```ts
await withPolicyDisabled(admin, "public", "profiles", "profiles_select_own", async () => {
  const { data } = await otroUsuarioClient.from("profiles").select().eq("id", userA.userId);
  expect(data).toHaveLength(1); // con la policy activa este mismo expect da 0 filas
});
```

## Recuperación de contraseña en E2E sin mandar ningún email (VGRP-45)

El Send Email Hook de Supabase (lo único que llamaría a Resend) **no está
registrado a propósito** (ver `docs/EMAIL.md`) — hoy `resetPasswordForEmail()`
dispara el email por defecto de Supabase, no pasa por Resend. Interceptar
Resend no serviría de nada en ese camino, y mockear el hook para "cuando esté
activo" sería simular un estado que hoy no se puede probar de verdad.

`test/helpers/recovery.ts::generateRecoveryLink(admin, email, redirectTo)` usa
el Admin API de Supabase (`generateLink`) para conseguir el mismo link que
traería el email, sin mandar nada — pensado por Supabase exactamente para
este caso. El E2E de VGRP-45 (`e2e/recuperar-password.spec.ts`) navega directo
a ese link con Playwright, como si el usuario hubiera hecho clic en el mail
real. La entrega por Resend ya se prueba a nivel unitario en
`lib/email/send.test.ts` y `app/api/auth/send-email/route.test.ts` — el E2E no
necesita repetir eso.

**Actualización (verificado a mano al escribir el E2E):** contra este
proyecto, ese link real NO canjea con `?code=` — Supabase resuelve el
`token_hash` en su propio `/auth/v1/verify` y redirige derecho a
`redirect_to` con los tokens en el FRAGMENTO (`#access_token=...`, flujo
implícito), nunca con `code` en la query string. `app/auth/callback/route.ts`
sólo lee `code` de la query (el fragmento nunca llega al servidor), así que
este link real, aunque válido, no deja sesión: aterriza en
`/recuperar/nueva?error=invalido`. `e2e/recuperar-password.spec.ts` prueba
esto HONESTAMENTE (navega el link real y confirma que hoy termina en ese
error, en vez de asumir que canjea) y deja la parte "definir contraseña
nueva de punta a punta" como `test.skip()` documentado — no es un bug de
este ticket, es el mismo hallazgo que ya había anotado
`test/integration/auth-actions.test.ts` (VGRP-45 §1/§2), confirmado ahora
también con browser real. Ver docs/EMAIL.md, "Deuda conocida", para el
camino real de arreglo (`/auth/confirm` + `verifyOtp()`), fuera del alcance
de VGRP-45.

## Variables de entorno

Además de las que ya usa la app (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), los tests necesitan:

- `SUPABASE_SERVICE_ROLE_KEY` — service role del mismo proyecto (Project
  Settings → API → `service_role`). Bypassea RLS a propósito: el seed y la
  limpieza necesitan crear/borrar usuarios y escribir `nivel`/`rol` directo.
  **Nunca** debe llegar al bundle de cliente ni commitearse — solo en
  `.env.local` (gitignored) y como secret de GitHub Actions.

Ver `.env.example` para la plantilla completa. `vitest`/`playwright`/`tsx` NO
cargan `.env.local` solos (eso es algo que hace Next.js solo para sí mismo) —
`test/helpers/load-env.ts` lo hace por ellos, sin depender de la librería
`dotenv`. Alcanza con tener las variables en `.env.local`.

## Correr todo localmente

```bash
# unit + integración (no necesita Supabase salvo que el test lo use)
pnpm test

# una vez agregado SUPABASE_SERVICE_ROLE_KEY a .env.local:
pnpm db:seed:test
pnpm test:e2e

# si algo quedó sucio (una corrida que se cortó a la mitad, por ejemplo):
pnpm test:cleanup
```

`pnpm test:e2e` levanta `pnpm build && pnpm start` automáticamente (ver
`webServer` en `playwright.config.ts`) y corre contra ese server local.

## CI

`.github/workflows/ci.yml` usa `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` como secrets del
repo. Mientras `SUPABASE_SERVICE_ROLE_KEY` no exista como secret, los steps
de Playwright/seed/E2E/limpieza se saltan explícitamente (visible en el log,
no es un fallo silencioso). Apenas se configure el secret, corren en cada
push/PR contra el proyecto real — y por eso el step de limpieza corre con
`if: always()`, incluso si el E2E falla.

**Esto le da a CI acceso de service role al proyecto real** — es una
decisión consciente de este ticket, no un descuido: es la misma base contra
la que corre todo. Tenerlo en cuenta al revisar quién tiene acceso a los
secrets del repo.

## Qué falta a partir de acá (no es de este ticket)

- VGRP-44: escribir los tests de esquema/RLS/claims en sí. La infraestructura
  para el criterio "verificar que fallan de verdad" ya está aplicada y tipada
  (`withPolicyDisabled`, arriba) — falta probarla de punta a punta contra el
  proyecto real (ver la nota de esa sección) y escribir el resto de los tests
  del ticket.
- VGRP-45: hecho (`e2e/registro-login-dashboard.spec.ts`,
  `e2e/recuperar-password.spec.ts`) con dos límites de entorno documentados
  como `test.skip()`, ninguno arreglable desde este ticket: (1) `/registro`
  no se puede completar de punta a punta porque `flags.registro_habilitado`
  resuelve `false` sin un store de Edge Config vinculado (VGRP-39, ver
  docs/EDGE-CONFIG.md) — probado en cambio con un usuario creado vía Admin
  API en el estado que un registro real dejaría; (2) el link de recuperación
  real no canjea con `?code=` en este proyecto (ver la sección de arriba) —
  probado en cambio que hoy aterriza honestamente en el error real.
- VGRP-42: el E2E de pago se adelantó al Bloque 6 (VGRP-48, ver abajo). Lo
  que queda para VGRP-42 es la regresión final sobre el sistema integrado
  completo (dashboard, gating, secciones, legales), no el primer E2E de pago.
- VGRP-47 §4: hecho — ver "El ritual de romper a propósito..." más abajo. La
  vista resultó tener una segunda capa de protección independiente
  (`nivel_overrides` sin grant a `authenticated`) que ni el propio ticket
  anticipaba; documentado como hallazgo, no como pendiente.

## Bloque 6 — VGRP-46/47/48 (tests de cobro y panel de admin)

Cierra en tests los Bloques 4 y 5. Resumen de cobertura nueva y de los
hallazgos reales, no supuestos:

- **VGRP-46** — `app/(app)/comprar/_actions.test.ts` (checkout, mockeado),
  `test/integration/webhook-mercadopago.test.ts` (el webhook real, Postgres
  real, firma HMAC real, sólo la API de MP mockeada — idempotencia,
  precedencia de nivel, revocación por `refunded`, FK de usuario inexistente),
  `instrumentation.test.ts`/`instrumentation-client.test.ts` (Sentry,
  `sendDefaultPii` siempre `false`), `lib/email/pago-aprobado.test.ts`. Un
  test agregado a `test/integration/pagos.test.ts` cubre que `proyectarNivel`
  no le pisa el `rol` a un admin.
  - **Bug real encontrado y corregido**: el webhook nunca revocaba el nivel
    ante un `refunded` (sólo reproyectaba en `approved`) — el PRD §8 dejaba
    la política de reembolso abierta; se definió revocación automática y se
    implementó en `app/api/webhooks/mercadopago/route.ts`.
  - **Bug real encontrado y corregido**: `reportarFalloDeProcesamiento` no
    incluía el string `mercadopago-webhook` en `extra.detalle` — el filtro
    de la Alert Rule de Sentry documentado en `docs/OBSERVABILIDAD.md` nunca
    iba a matchear.
- **VGRP-47** — `lib/auth/admin.test.ts`, `test/structural/admin-surface.test.ts`
  y `test/structural/server-only-boundary.test.ts` (estructurales: guard
  `requireAdmin()` obligatorio y en orden, `server-only` presente),
  `lib/data/admin/audit-log.unit.test.ts` (el hueco de auditoría: insert de
  auditoría que falla después de una mutación exitosa),
  `test/integration/admin-usuarios-nivel.test.ts`,
  `lib/data/admin/keyset.test.ts` + `usuarios-busqueda.test.ts`
  (`escaparLike`, empate de `created_at`),
  `test/integration/admin-pagos-ledger-rls.test.ts` (la vista
  `admin_pagos_ledger` no es legible por `anon`/`authenticated`),
  `lib/data/admin/pagos-sin-aplicar.test.ts`,
  `test/integration/admin-pagos-reprocesar-concurrente.test.ts`,
  `lib/data/admin/pagos-sanitizar.unit.test.ts` (fuga de `payload_raw`).
  - Hallazgo: `admin_audit_log.actor_id` y `nivel_overrides.actor_id` SÍ
    tienen FK a `profiles` — un `actorId` simulado sin un usuario real
    detrás rompe el insert.
- **VGRP-48** — `e2e/pago-aprobado-acceso.spec.ts` (nuevo),
  `e2e/superficie-no-admin.spec.ts` (nuevo), y un callout agregado a
  `e2e/admin-reprocesar-pago.spec.ts` (el panel avisa con "Hay N en total"
  antes de que el admin entre al detalle).
  - **Bug real encontrado y corregido** (el más importante de los tres):
    `lib/auth/browser.ts::createSupabaseBrowserClient()` usaba `getEnv()`
    (`lib/env.ts`, acceso dinámico `process.env[name]`) para leer
    `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Next.js sólo
    inlinea en el bundle del browser las referencias LITERALES
    `process.env.NEXT_PUBLIC_ALGO` — con acceso dinámico, esas dos variables
    siempre resolvían `undefined` del lado del cliente, sin importar
    `.env.local`. Esto rompía en silencio TODA build de producción de
    `/comprar/pendiente` (la pantalla de espera post-pago, VGRP-22): nunca se
    detectó antes porque ningún test previo ejecutaba ese componente contra
    un build real. Se arregló referenciando las dos variables de forma
    literal en `lib/auth/browser.ts`, sin pasar por `getEnv()`.
  - **Límite de entorno confirmado y documentado como `test.skip()`**:
    `app/(app)/comprar/page.tsx` se prerenderiza estático en build time;
    `getPrecios()` falla sin un store de Edge Config vinculado (VGRP-39) y
    ese resultado ("Checkout no disponible") queda horneado en el HTML del
    build — ningún test contra este build puede ver los botones de compra
    reales. Mismo tipo de límite que ya documentaba VGRP-45 para `/registro`.
  - Suite completa verificada: `pnpm test` (294 passed / 4 todo — los 2
    fallos de `test/integration/auth-actions.test.ts` son preexistentes, ver
    nota abajo) y `pnpm test:e2e` (14 passed / 3 skipped documentados, 0
    failed). `pnpm test:cleanup` corrido al final: 0 residuos.

### El ritual de "romper a propósito y confirmar rojo" — ejecutado de verdad

Los tres tickets del bloque piden explícitamente romper garantías clave,
correr la suite, confirmar rojo, y revertir. Se ejecutó cada rotura de
verdad (editando el código, corriendo la suite, confirmando el fallo, y
revirtiendo) en vez de darlo por sentado porque "el test ya existe":

- **VGRP-46 (a) — confiar en el `status` del body**: se hizo leer
  `JSON.parse(cuerpoCrudo).status` en vez de sólo `pago.status` (la API real)
  en `route.ts`. Rojo confirmado: el test "un status inventado en el body
  nunca pisa el status real de la API" falló (`expected 'rejected' to be
  'approved'`). Nota: inyectar el campo `status` en el objeto ya validado por
  Zod (`parseado`) NO alcanza para reproducir el bug — `payloadSchema`, sin
  `strict()`, ya lo strippea; hay que leerlo del JSON crudo antes de Zod para
  que la rotura tenga efecto. Revertido y confirmado limpio con `git diff`.
- **VGRP-46 (b) — romper la idempotencia**: se agregó un sufijo random a
  `proveedor_ref` en `insertarPago` (`lib/data/pagos.ts`), evadiendo el
  `UNIQUE(proveedor_ref, estado)`. Rojo confirmado: 2 tests fallaron ("cero
  filas nuevas" pasó a 2 filas; el nivel no cayó tras un `refunded` porque el
  reembolso ya no matcheaba el `proveedor_ref` original). Revertido.
- **VGRP-47 (a) — sacarle `requireAdmin()` a un handler**: se reemplazó el
  guard real por uno hardcodeado en
  `app/api/admin/pagos/[id]/reprocesar/route.ts`. Primer intento en falso
  verde: el test estructural (`test/structural/admin-surface.test.ts`) hace
  `content.indexOf("requireAdmin(")` sobre el archivo completo SIN sacar
  comentarios — el comentario de cabecera ("`requireAdmin()` va PRIMERO...")
  ya contenía ese substring literal y lo hacía pasar aunque el código real ya
  no llamara a nada. **Bug real de test encontrado y corregido**: se agregó
  `sinComentarios()` (saca `//` y `/* */` antes de buscar la llamada) y se
  aplicó a los tres chequeos de texto del archivo (`requireAdminPage()` en el
  layout, `requireAdmin()` en los handlers, `conAuditoria()` en los
  handlers). Con el fix, la rotura confirmó rojo de verdad. Revertido y
  vuelto a confirmar verde con el fix del test ya en pie.
- **VGRP-47 (b) — mutar sin pasar por `conAuditoria()`**: se llamó a
  `reprocesarPago()` directo, sin envolver en `conAuditoria()`, en el mismo
  handler. Rojo confirmado (con el fix de `sinComentarios()` del punto
  anterior). Revertido.
- **VGRP-47 (c) — dar `grant select` a `authenticated` sobre
  `admin_pagos_ledger`**: ejecutado contra el proyecto real (MCP de Supabase,
  una vez autenticado) y con un hallazgo real en el camino. El `grant`
  literal que pide el ticket (sólo sobre la vista) **no alcanzó para exponer
  datos**: `admin_pagos_ledger` tiene `security_invoker=true`, y una de las
  tablas que joinea (`nivel_overrides`, usada en el cálculo de
  `sin_aplicar`) nunca tuvo `grant select` para `authenticated` — es una
  segunda barrera independiente de la de la vista. Con sólo el grant de la
  vista, el test seguía en verde, pero por un motivo distinto al esperado:
  `select` fallaba con `42501 permission denied for table nivel_overrides`,
  no por la vista en sí. Para confirmar que el test NO es decorativo, se
  agregó también `grant select on public.nivel_overrides to authenticated`
  (recreando la brecha completa que haría falta para exponer datos de
  verdad) — con las dos capas rotas, el test SÍ se puso rojo
  (`AssertionError: expected null not to be null`, en el caso del usuario
  autenticado normal). Confirmado el mecanismo real, se revirtieron ambos
  grants (`revoke select on nivel_overrides from authenticated` y `revoke
  select on admin_pagos_ledger from authenticated`) y se confirmó con una
  query a `information_schema.role_table_grants` que el estado quedó
  idéntico al original (cero filas para `anon`/`authenticated` en ambas
  tablas). Se corrió `NOTIFY pgrst, 'reload schema'` después de cada cambio
  de grants — sin eso, PostgREST puede tardar en reflejar el cambio. El test
  volvió a verde tras el revert.
- **VGRP-48 — el mismo ritual "sobre el sistema entero" (E2E/integrado)**:
  - La rotura de RLS sobre `pagos` (`pagos_select_own`) YA es un test
    permanente en pie desde VGRP-44
    (`test/integration/rls.test.ts` — "SIN pagos_select_own, ni siquiera el
    dueño puede leer su propio pago"), que corre en cada ejecución de la
    suite contra el proyecto real vía `withPolicyDisabled`. Se corrió de
    nuevo para esta verificación y confirmó el mecanismo funcionando (pasó en
    verde, que es lo esperado: la aserción positiva de la garantía).
  - La rotura de status-trust del webhook **no tiene un punto de entrada
    E2E**: los specs de `pago-aprobado-acceso.spec.ts` llaman directo a
    `insertarPago`/`proyectarNivel` (las mismas funciones que usa el
    Route Handler) en vez de pegarle por HTTP al webhook — ver el comentario
    grande al inicio de ese archivo (Playwright levanta el server como
    proceso hijo separado; no hay forma de inyectarle un `vi.mock` a la API
    de MP desde ahí). La única cobertura real de esa garantía es la de
    VGRP-46, ya confirmada arriba.
  - Se intentó romper `requireAdmin()` en
    `app/api/admin/usuarios/[id]/nivel/route.ts` y correr
    `superficie-no-admin.spec.ts` (que le pega por `fetch()` real desde el
    browser). **Falso verde real, no de test sino de capa**:
    `middleware.ts` (`isAdminArea()`, VGRP-35) ya corta con 404 cualquier
    request a `/api/admin/**` de un usuario `rol != admin` ANTES de que el
    Route Handler llegue a ejecutarse — así que sacarle el guard al handler
    no cambia nada observable desde un browser real; ambas capas protegen la
    MISMA request. Es defensa en profundidad funcionando tal cual está
    diseñada, pero significa que el E2E de superficie no puede aislar el
    guard del handler del guard del middleware — esa garantía específica
    sólo la cubre `test/structural/admin-surface.test.ts` (ya confirmado
    rojo arriba) y `lib/auth/admin.test.ts`. Revertido.
  - Verificación final de que ningún revert quedó a medio camino:
    `git diff --stat` sobre los cuatro archivos tocados por las roturas
    (`route.ts` del webhook, `pagos.ts`, ambos `route.ts` de admin) mostró
    únicamente los cambios legítimos de VGRP-46/48 (revocación por
    `refunded`, string `mercadopago-webhook`) — cero restos de código de
    rotura. `pnpm typecheck`, `pnpm biome ci .`, `pnpm test` y
    `pnpm test:e2e` corridos de nuevo después de todo el ritual: mismo
    resultado que arriba (294/300 passed, 14/17 E2E passed, sin
    regresiones). `pnpm test:cleanup`: 0 residuos.

**Nota sobre `test/integration/auth-actions.test.ts`** (VGRP-18, no es de
este bloque): sus dos tests de `registrarse()` fallan hoy en este entorno por
la misma causa que ya documenta VGRP-45 — `flags.registro_habilitado`
resuelve `false` sin Edge Config vinculada, así que la Server Action nunca
llega a redirigir. No es una regresión de este bloque (confirmado con `git
log`/`git diff`, el archivo no se tocó) ni algo que el Bloque 6 deba
arreglar — queda anotado acá para que quien vea rojo en `pnpm test` sepa por
qué antes de investigar de cero.
