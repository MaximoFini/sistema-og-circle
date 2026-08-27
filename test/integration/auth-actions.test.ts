// VGRP-45 §1/§2 (cubre VGRP-18 y VGRP-19) — tests de integración de verdad
// contra el proyecto real de Supabase (docs/TESTING.md) para las Server
// Actions de `app/(auth)/_actions.ts`: registro, login y recuperación de
// contraseña. La validación Zod en sí ya está testeada a nivel esquema en
// `app/(auth)/_schemas.test.ts` — acá sólo se confirma que ESE esquema corre
// del lado del servidor, nunca se repiten los casos de esquema.
//
// -----------------------------------------------------------------------------
// POR QUÉ ESTE ARCHIVO MOCKEA `next/headers` Y `@/lib/config`
// -----------------------------------------------------------------------------
// `_actions.ts` corre en un Server Action real, así que usa `cookies()`/
// `headers()` de `next/headers` (vía `createSupabaseServerClient()` en
// `lib/auth/server.ts`, y directo en `getOrigin()`). Esas funciones dependen
// de un `AsyncLocalStorage` que sólo existe dentro del runtime de Next.js —
// llamadas así nomás desde un test de Vitest en Node plano, TIRAN
// ("`cookies` was called outside a request scope"), verificado a mano antes
// de escribir este archivo. `claims.test.ts` (VGRP-44) ya dejó documentada la
// misma limitación para `getVerifiedClaims()` y la esquivó no probando esa
// función directo; acá no se puede esquivar así porque el ticket pide probar
// las Server Actions en sí, así que la única forma real de invocarlas es
// mockear `next/headers` con un cookie jar en memoria — nunca se mockea
// Supabase (eso sigue siendo 100% real, service_role + anon contra el
// proyecto de verdad).
//
// El jar es compatible en serio con `@supabase/ssr`: no se fabrica el formato
// de cookie de sesión a mano en ningún lado. Cuando un test necesita que una
// Server Action VEA una sesión ya activa (definirNuevaPassword, que asume que
// `app/auth/callback/route.ts` ya canjeó el link antes — ver el comentario de
// ese archivo), se arma un cliente `@supabase/ssr` propio apuntando al MISMO
// jar y se le pide `setSession()`: ese cliente serializa la cookie con el
// mismo código que usa `createSupabaseServerClient()` internamente, así que
// el round-trip es real, no un mock del resultado.
//
// `@/lib/config`(`getFlags()`) se mockea porque este proyecto no tiene
// `EDGE_CONFIG` seteada en `.env.local` (no hace falta para nada más de la
// suite): sin mock, `getFlags()` cae a su default fail-closed
// (`registro_habilitado: false`, ver lib/config/index.ts) y `registrarse()`
// cortaría en la primera línea para TODOS los tests de registro. Es
// scaffolding de entorno, no el comportamiento bajo test — igual que
// `route.test.ts` mockea `enviarEmail()` para no pegarle a Resend mientras
// mantiene 100% real la verificación de firma que sí es el comportamiento bajo
// test ahí.

import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../lib/database.types";
import { createAuthenticatedUser } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import "../helpers/load-env";
import { generateRecoveryLink } from "../helpers/recovery";
import { findSeedUser, SEED_USERS, TEST_EMAIL_SUFFIX } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

// -----------------------------------------------------------------------------
// Cookie jar compartido entre el mock de `next/headers` y los clientes
// `@supabase/ssr` que arma cada test para "empujar" una sesión (o leerla
// después de que la Server Action la escribió). `let` a propósito: el factory
// de `vi.mock` de abajo captura esta variable por referencia, no por valor —
// `beforeEach` la reasigna a un Map nuevo por test sin que haga falta re-mockear
// nada.
// -----------------------------------------------------------------------------
let cookieJar: Map<string, string>;
let requestHeaders: Headers;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
  headers: async () => requestHeaders,
}));

vi.mock("@/lib/config", () => ({
  getFlags: async () => ({
    checkout_habilitado: false,
    registro_habilitado: true,
    fase: "2" as const,
  }),
}));

beforeEach(() => {
  cookieJar = new Map();
  requestHeaders = new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" });
});

// Import DESPUÉS de los `vi.mock` de arriba (hoisted igual, pero así queda
// explícito en el archivo que estas son las funciones ya mockeadas por debajo).
const { iniciarSesion, registrarse, solicitarReset, definirNuevaPassword } = await import(
  "../../app/(auth)/_actions"
);
const { INITIAL_ACTION_STATE } = await import("../../app/(auth)/_schemas");

const admin = createTestAdminClient();

function nuevoEmail(prefijo: string): string {
  return `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
}

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(campos)) fd.set(key, value);
  return fd;
}

/**
 * Ejecuta una Server Action que se espera termine en `redirect()` (éxito) y
 * devuelve el path al que redirigió. `redirect()` de `next/navigation` SIEMPRE
 * tira (no depende de contexto de request, verificado a mano), con un
 * `digest` de forma `NEXT_REDIRECT;<tipo>;<destino>;<status>;` — es la forma
 * documentada de detectarlo desde fuera del árbol de render de Next.
 */
async function capturarRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const err = e as Error & { digest?: string };
    if (!err.digest?.startsWith("NEXT_REDIRECT")) throw err;
    const destino = err.digest.split(";")[2];
    if (!destino) throw new Error(`Digest de redirect con forma inesperada: ${err.digest}`);
    return destino;
  }
  throw new Error("Se esperaba que la Server Action redirigiera (NEXT_REDIRECT) y no lo hizo.");
}

/** Cliente `@supabase/ssr` apuntado al `cookieJar` del test actual — mismo
 * cliente por dentro que usa `createSupabaseServerClient()`, así que sirve
 * tanto para "empujar" una sesión (setSession) como para leerla después de
 * que la Server Action escribió cookies nuevas (getUser). */
function clienteDeJar() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) cookieJar.set(name, value);
        },
      },
    },
  );
}

async function obtenerUserIdPorEmail(email: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("id").eq("email", email).single();
  if (error || !data) {
    throw new Error(`No se encontró profiles.id para ${email}: ${error?.message ?? "sin fila"}`);
  }
  return data.id;
}

/**
 * Tolerancia para las comparaciones de timing "sin enumeración" de abajo.
 *
 * Objetivo: detectar una diferencia ESTRUCTURAL (una rama que hace una
 * query/round-trip extra que la otra no hace), no jitter de red normal entre
 * dos llamadas HTTP consecutivas contra el mismo proyecto. Con jitter típico
 * de un puñado de días entre 100-600ms por llamada (confirmado a mano contra
 * este proyecto real antes de escribir el test), un ratio de 3x O una
 * diferencia absoluta de 400ms cubre ampliamente esa variancia sin dejar
 * pasar un caso realmente distinto (por ejemplo, si una rama disparara sin
 * querer un email real o una query en serie de más). Se exige que se cumpla
 * al menos UNA de las dos condiciones (no las dos), justamente para tolerar
 * que una sea consistentemente algo más lenta que la otra (acá,
 * `registrarse()` con email nuevo hace un UPDATE de más a `profiles` que el
 * camino de duplicado no hace — ver el comentario de `_actions.ts` línea
 * ~93-99, que reconoce esta asimetría explícitamente como mitigación y no
 * como cierre total del canal de timing).
 */
function tiempoComparable(msA: number, msB: number): boolean {
  const diferencia = Math.abs(msA - msB);
  const ratio = Math.max(msA, msB) / Math.max(Math.min(msA, msB), 1);
  return diferencia < 400 || ratio < 3;
}

describe("registrarse — VGRP-18", () => {
  let userIdACleanup: string | null = null;

  afterEach(async () => {
    if (userIdACleanup) {
      await cleanupUser(userIdACleanup);
      userIdACleanup = null;
    }
  });

  it("un registro exitoso crea profiles con nivel='ninguno', persiste nombre/telefono y deja logueado", async () => {
    const email = nuevoEmail("registro-ok");
    const fd = formData({
      nombre: "Ada Lovelace",
      email,
      telefono: "+54 9 11 5555-1234",
      password: "una-password-valida-1",
    });

    const destino = await capturarRedirect(() => registrarse(INITIAL_ACTION_STATE, fd));
    expect(destino).toBe("/dashboard");

    userIdACleanup = await obtenerUserIdPorEmail(email);

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel, nombre, telefono, email")
      .eq("id", userIdACleanup)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("ninguno");
    expect(profile?.nombre).toBe("Ada Lovelace");
    expect(profile?.telefono).toBe("+54 9 11 5555-1234");

    // "Deja logueado": las cookies que la propia Server Action escribió
    // durante el signUp (vía `createSupabaseServerClient()`) tienen que
    // alcanzar para que un cliente aparte, apuntado al mismo jar, resuelva un
    // usuario real — no alcanza con "no tiró error", hace falta una sesión
    // que autentique de verdad contra Supabase.
    const { data: userData, error: userError } = await clienteDeJar().auth.getUser();
    expect(userError).toBeNull();
    expect(userData.user?.email).toBe(email);
  });

  it("una contraseña débil (menos de 8 caracteres) se rechaza con el mensaje del requisito, sin crear cuenta", async () => {
    const email = nuevoEmail("registro-debil");
    const fd = formData({
      nombre: "Alan Turing",
      email,
      telefono: "+54 9 11 5555-4321",
      password: "1234567", // 7 caracteres: bajo el mínimo de 8 de `_schemas.ts`
    });

    const resultado = await registrarse(INITIAL_ACTION_STATE, fd);

    expect(resultado.fieldErrors?.password?.[0]).toBe(
      "La contraseña tiene que tener al menos 8 caracteres.",
    );

    // Confirmamos que de verdad no se creó nada: Zod cortó antes de llegar a
    // `supabase.auth.signUp()`.
    const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    expect(data).toBeNull();
  });

  it("sin enumeración de emails: mismo mensaje y tiempo comparable entre un email nuevo y uno ya registrado", async () => {
    // Camino B primero (duplicado): usamos un usuario seed existente, nunca
    // se le toca la password (signUp con email duplicado no la modifica, sólo
    // falla en el intento de creación — confirmado contra el proyecto real:
    // Supabase responde error "User already registered", 422).
    const seed = findSeedUser("principiante");
    const fdDuplicado = formData({
      nombre: "Quien Sea",
      email: seed.email,
      telefono: "+54 9 11 5555-0000",
      password: "otra-password-cualquiera-1",
    });
    const t0 = performance.now();
    const resultadoDuplicado = await registrarse(INITIAL_ACTION_STATE, fdDuplicado);
    const msDuplicado = performance.now() - t0;

    // Camino A (email nuevo, éxito real) — se limpia en el afterEach.
    const emailNuevo = nuevoEmail("registro-nuevo");
    const fdNuevo = formData({
      nombre: "Quien Sea",
      email: emailNuevo,
      telefono: "+54 9 11 5555-0000",
      password: "otra-password-cualquiera-1",
    });
    const t1 = performance.now();
    const destino = await capturarRedirect(() => registrarse(INITIAL_ACTION_STATE, fdNuevo));
    const msNuevo = performance.now() - t1;
    expect(destino).toBe("/dashboard");
    userIdACleanup = await obtenerUserIdPorEmail(emailNuevo);

    // "Mismo mensaje": el mensaje del camino duplicado es SIEMPRE el genérico
    // fijo de `_actions.ts`, nunca el texto crudo de Supabase ("User already
    // registered") — es lo que de verdad evita que la respuesta delate que el
    // email ya existía.
    expect(resultadoDuplicado.error).toBe(
      "No pudimos crear la cuenta con ese email. Si ya tenés cuenta, iniciá sesión.",
    );

    expect(
      tiempoComparable(msDuplicado, msNuevo),
      `Tiempos no comparables: duplicado=${msDuplicado.toFixed(0)}ms, nuevo=${msNuevo.toFixed(0)}ms`,
    ).toBe(true);
  });
});

describe("iniciarSesion — VGRP-18", () => {
  it("credenciales inválidas (usuario inexistente o password incorrecta) devuelven SIEMPRE el mismo mensaje genérico", async () => {
    const seed = findSeedUser("avanzado");

    const fdInexistente = formData({
      email: nuevoEmail("no-existe"),
      password: "cualquier-cosa-123",
    });
    const resultadoInexistente = await iniciarSesion(INITIAL_ACTION_STATE, fdInexistente);

    const fdPasswordMala = formData({ email: seed.email, password: "password-incorrecta-123" });
    const resultadoPasswordMala = await iniciarSesion(INITIAL_ACTION_STATE, fdPasswordMala);

    expect(resultadoInexistente.error).toBe("Email o contraseña incorrectos.");
    expect(resultadoPasswordMala.error).toBe("Email o contraseña incorrectos.");
    expect(resultadoInexistente.error).toBe(resultadoPasswordMala.error);
  });

  it("con credenciales correctas, redirige respetando `next` cuando es un path propio seguro", async () => {
    const seed = findSeedUser("ninguno");
    const fd = formData({ email: seed.email, password: seed.password, next: "/dashboard/pagos" });

    const destino = await capturarRedirect(() => iniciarSesion(INITIAL_ACTION_STATE, fd));

    expect(destino).toBe("/dashboard/pagos");
  });

  it("un `next` inseguro (otro origen) cae al default, en vez de usarse tal cual — confirma que `_actions.ts` llama a safeRedirectPath()", async () => {
    // No se repiten acá los casos exhaustivos de `safeRedirectPath()` (ya
    // cubiertos en lib/auth/redirect.test.ts): sólo se confirma que
    // `iniciarSesion()` de verdad lo usa, con UN caso inseguro representativo.
    const seed = findSeedUser("ninguno");
    const fd = formData({
      email: seed.email,
      password: seed.password,
      next: "https://sitio-atacante.invalid/robar",
    });

    const destino = await capturarRedirect(() => iniciarSesion(INITIAL_ACTION_STATE, fd));

    expect(destino).toBe("/dashboard");
  });

  it("la validación Zod corre en el servidor: un FormData armado a mano que viola el esquema se rechaza sin loguear", async () => {
    // Sin pasar por ningún form/UI: un email inválido que ningún <input
    // type="email"> del navegador dejaría escribir así.
    const fd = formData({ email: "esto-no-es-un-email", password: "algo" });

    const resultado = await iniciarSesion(INITIAL_ACTION_STATE, fd);

    expect(resultado.fieldErrors?.email?.[0]).toBeTruthy();
    expect(resultado.error).toBeUndefined();
    // Ninguna sesión se estableció: el cookie jar sigue vacío porque Zod
    // cortó antes de construir el cliente de Supabase.
    expect(cookieJar.size).toBe(0);
  });

  // Rate limit de login: no hay implementación propia en `_actions.ts` — es
  // un login normal contra `supabase.auth.signInWithPassword()`, sin ningún
  // contador/bloqueo escrito en este repo (grep sobre app/ y lib/ para
  // "rate limit"/"throttle" antes de escribir este archivo: cero resultados
  // relacionados con auth). El único rate limit que existe es el nativo de
  // Supabase Auth a nivel de proyecto, no configurable desde este código.
  // Deliberadamente NO se dispara de verdad contra el proyecto real: es un
  // proyecto COMPARTIDO por todo el equipo (docs/TESTING.md) y activar el
  // límite nativo de intentos fallidos afectaría a cualquier compañero
  // logueándose en simultáneo, no sólo a este test run.
  it.todo(
    "rate limit de login: responsabilidad 100% de la plataforma (límite nativo de Supabase Auth a nivel proyecto), sin lógica propia en _actions.ts que testear — no se dispara a propósito contra el proyecto compartido",
  );
});

describe("solicitarReset — VGRP-19", () => {
  it("sin enumeración: mensaje idéntico y tiempo comparable exista o no la cuenta", async () => {
    const emailInexistente = nuevoEmail("no-existe-reset");
    const seed = findSeedUser("avanzado");

    const t0 = performance.now();
    const resultadoInexistente = await solicitarReset(
      INITIAL_ACTION_STATE,
      formData({ email: emailInexistente }),
    );
    const msInexistente = performance.now() - t0;

    const t1 = performance.now();
    const resultadoExistente = await solicitarReset(
      INITIAL_ACTION_STATE,
      formData({ email: seed.email }),
    );
    const msExistente = performance.now() - t1;

    const MENSAJE_ESPERADO =
      "Si el email está registrado, te mandamos un link para recuperar tu contraseña.";
    expect(resultadoInexistente.mensaje).toBe(MENSAJE_ESPERADO);
    expect(resultadoExistente.mensaje).toBe(MENSAJE_ESPERADO);

    // Acá la garantía estructural es más fuerte que en `registrarse()`: el
    // código de `solicitarReset()` ni siquiera LEE el `error` que devuelve
    // `resetPasswordForEmail()` (a propósito, ver el comentario grande de
    // `_actions.ts`) — las dos ramas ejecutan exactamente la misma única
    // llamada de red, así que la tolerancia de `tiempoComparable()` sólo
    // necesita cubrir jitter, no una asimetría de trabajo esperada.
    expect(
      tiempoComparable(msInexistente, msExistente),
      `Tiempos no comparables: inexistente=${msInexistente.toFixed(0)}ms, existente=${msExistente.toFixed(0)}ms`,
    ).toBe(true);
  });

  it("la validación Zod corre en el servidor: un email inválido armado a mano se rechaza", async () => {
    const resultado = await solicitarReset(
      INITIAL_ACTION_STATE,
      formData({ email: "no-es-un-email" }),
    );

    expect(resultado.fieldErrors?.email?.[0]).toBeTruthy();
    expect(resultado.mensaje).toBeUndefined();
  });

  // Mismo criterio que el rate limit de login: `solicitarReset()` no tiene
  // ningún contador propio, sólo llama a `resetPasswordForEmail()` una vez
  // por request. El límite de "cuántos resets por hora" es 100% nativo de
  // Supabase Auth (proyecto compartido, ver TESTING.md) — no se dispara a
  // propósito acá tampoco.
  it.todo(
    "rate limit de solicitudes de recuperación: responsabilidad 100% de la plataforma, sin lógica propia en _actions.ts — no se dispara a propósito contra el proyecto compartido",
  );
});

describe("definirNuevaPassword — VGRP-19 (flujo completo de recuperación)", () => {
  const PASSWORD_INICIAL = "test-password-1!"; // default de createAuthenticatedUser
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  /**
   * "Usa" el link de recuperación: consume el `token_hash` de
   * `generateRecoveryLink()` con `verifyOtp()` (la vía que la propia
   * `recovery.ts` documenta para tests — ver su comentario sobre `tokenHash`)
   * y empuja la sesión resultante al `cookieJar` compartido, como si
   * `app/auth/callback/route.ts` ya hubiera canjeado el link antes de llegar
   * a `definirNuevaPassword()` (que es exactamente lo que esa Server Action
   * asume, ver el comentario grande al inicio de esa función en `_actions.ts`).
   *
   * Por qué NO se sigue el `actionLink` con un `fetch()` real hasta
   * `/auth/callback?code=...` (que sería más fiel al camino real de
   * producción): contra este proyecto, un link generado por el Admin API NO
   * vuelve con `?code=` sino con los tokens en el FRAGMENTO de la URL
   * (`#access_token=...`, flujo implícito) — confirmado a mano antes de
   * escribir este archivo. `code_challenge`/PKCE sólo entra en juego cuando
   * el propio flujo lo inicia un cliente `@supabase/ssr` (como
   * `solicitarReset()` en producción), algo que el Admin API no reproduce.
   * Seguir ese `actionLink` acá probaría una URL que nunca ocurre así en la
   * práctica; `verifyOtp(token_hash)` prueba la garantía real que importa acá
   * (el link es de un solo uso) sin fabricar un mecanismo que no existe.
   */
  async function usarLinkDeRecuperacion(tokenHash: string) {
    const anon = createTestAnonClient();
    const { data, error } = await anon.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error || !data.session) {
      throw new Error(`verifyOtp("recovery") falló: ${error?.message ?? "sin sesión"}`);
    }
    const { error: setSessionError } = await clienteDeJar().auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setSessionError) throw setSessionError;
  }

  it("tras definir la nueva contraseña, el usuario queda logueado y la contraseña vieja deja de funcionar", async () => {
    const created = await createAuthenticatedUser("ninguno");
    userId = created.userId;

    const link = await generateRecoveryLink(
      admin,
      created.email,
      "http://localhost:3000/auth/callback",
    );
    await usarLinkDeRecuperacion(link.tokenHash);

    const NUEVA_PASSWORD = "una-password-nueva-1";
    const destino = await capturarRedirect(() =>
      definirNuevaPassword(INITIAL_ACTION_STATE, formData({ password: NUEVA_PASSWORD })),
    );
    expect(destino).toBe("/dashboard");

    // Logueado: el jar (ya con la sesión de la recuperación, más lo que
    // `updateUser()` haya refrescado) autentica de verdad contra Supabase.
    const { data: userData, error: userError } = await clienteDeJar().auth.getUser();
    expect(userError).toBeNull();
    expect(userData.user?.email).toBe(created.email);

    // La password vieja ya no sirve.
    const anonVieja = createTestAnonClient();
    const { error: loginViejaError } = await withAuthRetry(() =>
      anonVieja.auth.signInWithPassword({ email: created.email, password: PASSWORD_INICIAL }),
    );
    expect(loginViejaError).not.toBeNull();

    // Y la nueva sí.
    const anonNueva = createTestAnonClient();
    const { error: loginNuevaError } = await withAuthRetry(() =>
      anonNueva.auth.signInWithPassword({ email: created.email, password: NUEVA_PASSWORD }),
    );
    expect(loginNuevaError).toBeNull();
  });

  it("el link es de un solo uso: reusar el mismo token_hash una segunda vez falla", async () => {
    const created = await createAuthenticatedUser("ninguno");
    userId = created.userId;

    const link = await generateRecoveryLink(
      admin,
      created.email,
      "http://localhost:3000/auth/callback",
    );
    await usarLinkDeRecuperacion(link.tokenHash); // primer uso: consume el token_hash

    const anon = createTestAnonClient();
    const { data, error } = await anon.auth.verifyOtp({
      type: "recovery",
      token_hash: link.tokenHash,
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("sin una sesión activa (link nunca canjeado), definirNuevaPassword devuelve el mismo mensaje genérico — _actions.ts NO distingue vencido/inválido/usado", async () => {
    // A propósito NO se llama a `usarLinkDeRecuperacion()`: `cookieJar` queda
    // vacío, como si alguien navegara directo a /recuperar/nueva sin haber
    // pasado nunca por /auth/callback (link vencido, ya usado, o
    // directamente inventado — a nivel de `_actions.ts` las tres formas de
    // "no hay sesión" son indistinguibles, porque `definirNuevaPassword()`
    // sólo mira si `updateUser()` funciona, nunca el motivo).
    //
    // La distinción de mensaje ("Este link venció" / "ya fue usado" /
    // "no es válido") SÍ existe en la app, pero vive en
    // `app/auth/callback/route.ts` + `app/(auth)/recuperar/nueva/page.tsx`
    // (lee `?error=` de la URL), no en `_actions.ts` — fuera del alcance de
    // este archivo de Server Actions. No se inventa acá una distinción que
    // este código no hace.
    const resultado = await definirNuevaPassword(
      INITIAL_ACTION_STATE,
      formData({ password: "una-password-cualquiera-1" }),
    );

    expect(resultado.error).toBe(
      "No pudimos actualizar tu contraseña. Pedí un link nuevo e intentá de nuevo.",
    );
  });

  it("la validación Zod corre en el servidor: una password corta armada a mano se rechaza antes de tocar Supabase", async () => {
    const resultado = await definirNuevaPassword(
      INITIAL_ACTION_STATE,
      formData({ password: "corta" }),
    );

    expect(resultado.fieldErrors?.password?.[0]).toBe(
      "La contraseña tiene que tener al menos 8 caracteres.",
    );
  });
});

// -----------------------------------------------------------------------------
// Verificación final: no debería haber quedado ningún usuario de test ad hoc
// colgado si todos los afterEach/finally de arriba hicieron su trabajo. No es
// un reemplazo de la limpieza por test (que corre con cada usuario apenas se
// crea) — es sólo una señal temprana si algo se rompió a mitad de camino.
// `cleanupAllTestArtifacts()` en el global teardown de la suite (VGRP-43) es
// la red de seguridad real.
// -----------------------------------------------------------------------------
describe("housekeeping", () => {
  it("no quedan usuarios ad hoc de este archivo colgados (sólo los 4 fijos del seed)", async () => {
    const { data, error } = await withAuthRetry(() =>
      admin.auth.admin.listUsers({ perPage: 1000 }),
    );
    expect(error).toBeNull();

    const emailsDeTest = (data?.users ?? [])
      .map((u) => u.email)
      .filter((email): email is string => typeof email === "string")
      .filter((email) => email.endsWith(TEST_EMAIL_SUFFIX));

    const emailsSeed = new Set(SEED_USERS.map((u) => u.email));
    const colgados = emailsDeTest.filter((email) => !emailsSeed.has(email));

    expect(colgados).toEqual([]);
  });
});
