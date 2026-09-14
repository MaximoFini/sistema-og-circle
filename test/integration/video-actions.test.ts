// VGRP-50 — components/video/_actions.ts (marcarVideoVisto, obtenerProgresoVideos),
// hueco total. Tests de integración de verdad contra Postgres real (docs/TESTING.md),
// mismo patrón que test/integration/auth-actions.test.ts para invocar una Server Action
// real desde Vitest.
//
// `_actions.ts` usa `getVerifiedClaims()`/`createSupabaseServerClient()`
// (lib/auth/server.ts), que a su vez llaman a `cookies()` de `next/headers` — eso sólo
// existe dentro del runtime de request de Next.js; llamado así nomás desde Vitest, tira
// ("`cookies` was called outside a request scope", verificado por auth-actions.test.ts).
// Se mockea `next/headers` con un cookie jar en memoria — NUNCA Supabase, que sigue
// siendo 100% real (service_role para armar los fixtures, anon + `@supabase/ssr` para
// empujar una sesión real al jar).

import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "../../lib/database.types";
import { createAuthenticatedUser } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import "../helpers/load-env";
import { withAuthRetry } from "../helpers/with-auth-retry";

let cookieJar: Map<string, string>;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

beforeEach(() => {
  cookieJar = new Map();
});

const { marcarVideoVisto, obtenerProgresoVideos } = await import("../../components/video/_actions");

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser (test/helpers/auth.ts)

/** Cliente `@supabase/ssr` apuntado al mismo `cookieJar` que mockea `next/headers` —
 *  mismo mecanismo que test/integration/auth-actions.test.ts (clienteDeJar). */
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

/**
 * Loguea un usuario ya creado (createAuthenticatedUser, que sólo devuelve el
 * access_token, no el refresh_token) en el cookieJar compartido con el mock de
 * next/headers: un login propio con el password default + setSession() en un cliente
 * apuntado al mismo jar, para que getVerifiedClaims()/createSupabaseServerClient() vean
 * una sesión real.
 */
async function loguearEnJar(email: string): Promise<void> {
  const anon = createTestAnonClient();
  const { data, error } = await withAuthRetry(() =>
    anon.auth.signInWithPassword({ email, password: PASSWORD }),
  );
  if (error || !data.session) throw error ?? new Error(`login sin sesión para ${email}`);

  const { error: setError } = await clienteDeJar().auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) throw setError;
}

async function progresoDe(userId: string): Promise<Json> {
  const { data, error } = await admin.from("profiles").select("progreso").eq("id", userId).single();
  if (error) throw error;
  return data.progreso;
}

async function setProgreso(userId: string, progreso: Json): Promise<void> {
  const { error } = await admin.from("profiles").update({ progreso }).eq("id", userId);
  if (error) throw error;
}

const userIds: string[] = [];
afterEach(async () => {
  while (userIds.length > 0) {
    const id = userIds.pop() as string;
    await cleanupUser(id);
  }
});

describe("sin sesión (VGRP-50)", () => {
  it("marcarVideoVisto devuelve ok:false y no escribe nada", async () => {
    const resultado = await marcarVideoVisto(randomUUID());
    expect(resultado.ok).toBe(false);
  });

  it("obtenerProgresoVideos devuelve lista vacía", async () => {
    const resultado = await obtenerProgresoVideos();
    expect(resultado).toEqual({ videosVistos: [] });
  });
});

describe("marcarVideoVisto — con sesión real (VGRP-50)", () => {
  it("idempotencia: marcar el mismo video dos veces no duplica el id", async () => {
    const user = await createAuthenticatedUser("ninguno");
    userIds.push(user.userId);
    await loguearEnJar(user.email);
    const videoId = randomUUID();

    const primera = await marcarVideoVisto(videoId);
    const segunda = await marcarVideoVisto(videoId);

    expect(primera.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    if (primera.ok) expect(primera.videosVistos).toEqual([videoId]);
    if (segunda.ok) expect(segunda.videosVistos).toEqual([videoId]);

    const progreso = (await progresoDe(user.userId)) as { videosVistos?: string[] };
    expect(progreso.videosVistos).toEqual([videoId]);
  });

  it("merge, no pisada: si progreso ya tenía otras claves, siguen ahí después de marcar un video", async () => {
    const user = await createAuthenticatedUser("ninguno");
    userIds.push(user.userId);
    await setProgreso(user.userId, { otraClave: "valor-preexistente", numero: 42 } as Json);
    await loguearEnJar(user.email);
    const videoId = randomUUID();

    const resultado = await marcarVideoVisto(videoId);
    expect(resultado.ok).toBe(true);

    const progreso = (await progresoDe(user.userId)) as Record<string, unknown>;
    expect(progreso.otraClave).toBe("valor-preexistente");
    expect(progreso.numero).toBe(42);
    expect(progreso.videosVistos).toEqual([videoId]);
  });

  it("progreso con forma inválida (string, no objeto) no rompe: sanea y guarda una lista limpia", async () => {
    const user = await createAuthenticatedUser("ninguno");
    userIds.push(user.userId);
    await setProgreso(user.userId, "esto no es un objeto" as unknown as Json);
    await loguearEnJar(user.email);
    const videoId = randomUUID();

    const resultado = await marcarVideoVisto(videoId);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.videosVistos).toEqual([videoId]);

    const progreso = (await progresoDe(user.userId)) as { videosVistos?: string[] };
    expect(progreso.videosVistos).toEqual([videoId]);
  });

  it("progreso con forma inválida (objeto sin videosVistos, o con un tipo equivocado) no rompe: sanea a lista vacía antes de agregar", async () => {
    const user = await createAuthenticatedUser("ninguno");
    userIds.push(user.userId);
    await setProgreso(user.userId, { videosVistos: "no-es-un-array" } as unknown as Json);
    await loguearEnJar(user.email);
    const videoId = randomUUID();

    const resultado = await marcarVideoVisto(videoId);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.videosVistos).toEqual([videoId]);
  });

  it("progreso con array con elementos no-string se sanea: sólo quedan los strings (leído con obtenerProgresoVideos y confirmado por escritura de marcarVideoVisto)", async () => {
    const user = await createAuthenticatedUser("ninguno");
    userIds.push(user.userId);
    await setProgreso(user.userId, {
      videosVistos: ["real-id-1", 123, null, {}, "real-id-2", false],
    } as unknown as Json);
    await loguearEnJar(user.email);

    const leido = await obtenerProgresoVideos();
    expect(leido.videosVistos).toEqual(["real-id-1", "real-id-2"]);

    const nuevoId = randomUUID();
    const resultado = await marcarVideoVisto(nuevoId);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.videosVistos).toEqual(["real-id-1", "real-id-2", nuevoId]);
    }

    const progreso = (await progresoDe(user.userId)) as { videosVistos?: unknown[] };
    // La forma guardada en la base queda limpia — nunca persiste el 123/null/{}/false.
    expect(progreso.videosVistos).toEqual(["real-id-1", "real-id-2", nuevoId]);
  });

  it("un usuario no puede escribir el progreso de otro — RLS real con dos usuarios (no un mock que ya asuma el filtro)", async () => {
    const userA = await createAuthenticatedUser("ninguno");
    userIds.push(userA.userId);
    const userB = await createAuthenticatedUser("ninguno");
    userIds.push(userB.userId);

    // Directo contra Postgres con la sesión REAL de userA (anon + RLS activa), sin pasar
    // por marcarVideoVisto() (que ni siquiera acepta un userId objetivo — la única forma
    // de probar la garantía real es intentar pisar la fila de otro directamente, como
    // haría un atacante que se saltara la Server Action).
    const anonA = createTestAnonClient();
    const { error: signInError } = await withAuthRetry(() =>
      anonA.auth.signInWithPassword({ email: userA.email, password: PASSWORD }),
    );
    expect(signInError).toBeNull();

    const { data: updateData, error: updateError } = await anonA
      .from("profiles")
      .update({ progreso: { videosVistos: ["intento-ajeno"] } })
      .eq("id", userB.userId)
      .select();

    // RLS (`profiles_update_own`) filtra la fila antes de que el UPDATE la alcance: no
    // hay error, pero tampoco ninguna fila afectada.
    expect(updateError).toBeNull();
    expect(updateData).toEqual([]);

    const progresoB = await progresoDe(userB.userId);
    expect(JSON.stringify(progresoB)).not.toContain("intento-ajeno");
  });
});
