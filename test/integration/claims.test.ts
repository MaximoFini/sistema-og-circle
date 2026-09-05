// VGRP-44 (sección "Claims y Auth Hook", cubre VGRP-16) — tests de
// integración de verdad contra el proyecto real de Supabase (docs/TESTING.md).
// A diferencia de schema.test.ts, acá SÍ nos logueamos de verdad para
// conseguir JWTs reales firmados por el proyecto: nunca se fabrica ni se
// simula la firma ES256 (ver el comentario de getTokenWithClaim en
// test/helpers/auth.ts sobre por qué). Donde el ticket pide un token
// "inválido", se parte siempre de un token real y se lo corrompe, nunca se
// firma uno desde cero.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppMetadataClaims } from "../../lib/auth/claims";
import { getEnv } from "../../lib/env";
import { createAuthenticatedUser, getTokenWithClaim } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { applyNivelRol, createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import "../helpers/load-env";
import { findSeedUser, SEED_ADMIN_USER } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

/**
 * Decodifica (sin verificar firma) la segunda parte de un JWT. A propósito
 * sin librería nueva (jwt-decode, etc.) — el ticket pide hacerlo a mano con
 * `Buffer.from(part, "base64url")`, que alcanza para inspeccionar el
 * payload en estos tests.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `Token con forma inesperada (${parts.length} partes, se esperaban 3): ${token}`,
    );
  }
  const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
  return JSON.parse(payloadJson) as Record<string, unknown>;
}

function appMetadataDe(payload: Record<string, unknown>): Record<string, unknown> {
  const appMetadata = payload.app_metadata;
  if (typeof appMetadata !== "object" || appMetadata === null) {
    throw new Error(`El payload no tiene app_metadata: ${JSON.stringify(payload)}`);
  }
  return appMetadata as Record<string, unknown>;
}

describe("el JWT emitido contiene app_metadata.nivel/rol correctos (VGRP-16)", () => {
  it.each([
    ["ninguno", "user"],
    ["principiante", "user"],
    ["avanzado", "user"],
  ] as const)("usuario seed nivel=%s, rol=%s", async (nivel, rolEsperado) => {
    const { accessToken } = await getTokenWithClaim(nivel);
    const appMetadata = appMetadataDe(decodeJwtPayload(accessToken));

    expect(appMetadata.nivel).toBe(nivel);
    expect(appMetadata.rol).toBe(rolEsperado);
  });

  it("usuario seed admin (nivel=avanzado, rol=admin) — no pasa por getTokenWithClaim porque busca rol='user'", async () => {
    const anon = createTestAnonClient();
    const { data, error } = await withAuthRetry(() =>
      anon.auth.signInWithPassword({
        email: SEED_ADMIN_USER.email,
        password: SEED_ADMIN_USER.password,
      }),
    );
    expect(error).toBeNull();

    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Login del usuario seed admin no devolvió access_token.");

    const appMetadata = appMetadataDe(decodeJwtPayload(accessToken));
    expect(appMetadata.nivel).toBe(SEED_ADMIN_USER.nivel);
    expect(appMetadata.rol).toBe(SEED_ADMIN_USER.rol);
  });
});

// El ticket VGRP-44 pedía confirmar 401 para un JWT inválido/vencido. Contra
// el proyecto real, GoTrue (Supabase Auth) devuelve 403 con
// `error_code: "bad_jwt"` para cualquier JWT que no verifica (firma
// inválida, malformado, o vencido) — comprobado a mano contra
// `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user` antes de escribir estos tests.
// 401 sería "no autenticado"; acá el token SÍ viene, pero Auth lo identifica
// y rechaza explícitamente como inválido, que es el motivo del 403. Se
// documenta acá en vez de forzar el código que pedía el ticket.
describe("Supabase rechaza un JWT inválido (VGRP-16)", () => {
  it("un token real con un carácter del payload cambiado a mano (sin re-firmar) es rechazado con 403 bad_jwt", async () => {
    const { accessToken } = await getTokenWithClaim("avanzado");
    const [header, payload, signature] = accessToken.split(".");

    // Cambiamos un carácter en el medio del payload base64url: sigue siendo
    // una cadena "parseable" (mismo charset), pero el contenido ya no
    // coincide con la firma original, así que Supabase Auth tiene que
    // rechazarlo al verificar.
    const idx = Math.floor(payload.length / 2);
    const charOriginal = payload[idx];
    const charMutado = charOriginal === "A" ? "B" : "A";
    const payloadMutado = payload.slice(0, idx) + charMutado + payload.slice(idx + 1);
    const tokenCorrompido = `${header}.${payloadMutado}.${signature}`;

    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${tokenCorrompido}`,
        apikey: anonKey,
      },
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error_code?: string };
    expect(body.error_code).toBe("bad_jwt");
  });

  // No esperamos a que expire un token real (son de larga duración, ver
  // auth.ts) ni fabricamos uno firmado de verdad (no tenemos la clave
  // privada ES256 del proyecto — ver el comentario grande de
  // getTokenWithClaim). En cambio armamos un JWT con la MISMA forma que uno
  // real, con `exp` vencido, pero sin firma válida (no podemos producir una
  // sin la clave privada). Esto confirma la garantía que de verdad importa
  // acá: no hay forma de colar un `exp` manipulado sin la clave privada del
  // proyecto — un intento así siempre vuelve 403 bad_jwt, esté vencido o no.
  it("un JWT con exp vencido (fabricado, sin firma válida) es rechazado con 403 bad_jwt", async () => {
    const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const header = { alg: "ES256", typ: "JWT" };
    const payload = {
      sub: randomUUID(),
      role: "authenticated",
      app_metadata: { nivel: "avanzado", rol: "admin" },
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600, // vencido hace una hora
    };
    const tokenFabricado = `${encode(header)}.${encode(payload)}.firma-invalida`;

    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${tokenFabricado}`,
        apikey: anonKey,
      },
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error_code?: string };
    expect(body.error_code).toBe("bad_jwt");
  });
});

describe("verificar un JWT ya obtenido no genera red (VGRP-16)", () => {
  // getVerifiedClaims() vive en lib/auth/server.ts y usa
  // createSupabaseServerClient(), que depende de next/headers (cookies()) —
  // no es invocable fuera de un Server Component / Route Handler real, así
  // que no se puede llamar limpiamente desde un test de Vitest en Node
  // plano. Probamos el mismo principio ("verificar localmente no pega a la
  // red") directamente sobre supabase.auth.getClaims() de un cliente ya
  // logueado, que es exactamente el método que getVerifiedClaims() envuelve.
  it("una segunda llamada a getClaims() sobre el mismo token no dispara fetch", async () => {
    const anon = createTestAnonClient();
    const seedUser = findSeedUser("avanzado");
    const { error: signInError } = await withAuthRetry(() =>
      anon.auth.signInWithPassword({ email: seedUser.email, password: seedUser.password }),
    );
    expect(signInError).toBeNull();

    // "Calentamos" la caché de claves públicas (JWKS) del SDK: la primera
    // verificación local de un JWT de este proyecto puede necesitar bajarlas
    // una vez. Lo que nos interesa probar es la verificación en sí, una vez
    // que esas claves ya están en memoria — no el warm-up.
    await anon.auth.getClaims();

    const fetchSpy = vi.spyOn(global, "fetch");
    try {
      const { data, error } = await anon.auth.getClaims();

      expect(error).toBeNull();
      const claims = data?.claims as AppMetadataClaims | undefined;
      expect(claims?.app_metadata?.nivel).toBe("avanzado");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("un cambio de nivel en base se refleja en el claim tras renovar la sesión (VGRP-16)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("applyNivelRol + un nuevo login trae app_metadata.nivel actualizado en el JWT", async () => {
    const created = await createAuthenticatedUser("ninguno");
    userId = created.userId;

    // Confirmamos el punto de partida: el JWT de la sesión original todavía
    // tiene el nivel viejo, porque el hook lee profiles en el momento de
    // emitir CADA token — no hay forma de que un token ya emitido "se
    // actualice solo".
    if (!created.accessToken) throw new Error("createAuthenticatedUser no devolvió accessToken.");
    const appMetadataInicial = appMetadataDe(decodeJwtPayload(created.accessToken));
    expect(appMetadataInicial.nivel).toBe("ninguno");

    const admin = createTestAdminClient();
    await applyNivelRol(admin, userId, "avanzado", "user");

    // Sesión nueva (nuevo signInWithPassword, no un refresh de la vieja): es
    // lo que fuerza a Auth a emitir un JWT nuevo y correr el hook de nuevo
    // con el profiles ya actualizado.
    const anon = createTestAnonClient();
    const { data, error } = await withAuthRetry(() =>
      anon.auth.signInWithPassword({
        email: created.email,
        password: "test-password-1!", // default de createAuthenticatedUser, ver auth.ts
      }),
    );
    expect(error).toBeNull();

    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("El nuevo login no devolvió access_token.");

    const appMetadataNuevo = appMetadataDe(decodeJwtPayload(accessToken));
    expect(appMetadataNuevo.nivel).toBe("avanzado");
    expect(appMetadataNuevo.rol).toBe("user");
  });
});
