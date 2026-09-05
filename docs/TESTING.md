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
- VGRP-42: segundo flujo E2E — pago aprobado → acceso activado — y
  regresión final de todo el sistema integrado.
