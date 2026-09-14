// VGRP-50 — app/api/perfil/route.ts, hueco total. El handler hace
// `.from("profiles").select("nombre, email").single()` SIN `.eq()` — depende 100% de
// RLS (`profiles_select_own`) para que cada usuario vea sólo su propia fila. Tests de
// integración contra Postgres real (docs/TESTING.md), mismo mecanismo de cookie jar que
// test/integration/auth-actions.test.ts para invocar el Route Handler real desde Vitest
// (createSupabaseServerClient() usa cookies() de next/headers, que sólo existe dentro
// del runtime de request de Next — se mockea eso, nunca Supabase).

import { createServerClient } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../lib/database.types";
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

const { GET } = await import("../../app/api/perfil/route");

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser (test/helpers/auth.ts)

/** Mismo mecanismo que test/integration/auth-actions.test.ts / video-actions.test.ts. */
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

const userIds: string[] = [];
afterEach(async () => {
  while (userIds.length > 0) {
    const id = userIds.pop() as string;
    await cleanupUser(id);
  }
});

describe("GET /api/perfil (VGRP-27/VGRP-50)", () => {
  it("sin sesión: 401", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("dos usuarios sembrados: la respuesta trae SOLO nombre/email del que pidió — .single() no falla por 'más de una fila' pese a que profiles tiene más de una fila", async () => {
    const userA = await createAuthenticatedUser("ninguno");
    userIds.push(userA.userId);
    const userB = await createAuthenticatedUser("ninguno");
    userIds.push(userB.userId);

    const { error: errorA } = await admin
      .from("profiles")
      .update({ nombre: "Usuaria A - VGRP-50" })
      .eq("id", userA.userId);
    expect(errorA).toBeNull();
    const { error: errorB } = await admin
      .from("profiles")
      .update({ nombre: "Usuaria B - VGRP-50" })
      .eq("id", userB.userId);
    expect(errorB).toBeNull();

    await loguearEnJar(userA.email);
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ nombre: "Usuaria A - VGRP-50", email: userA.email });
    expect(body.nombre).not.toBe("Usuaria B - VGRP-50");
    expect(body.email).not.toBe(userB.email);
  });

  it("error de base: 500 sin filtrar el detalle crudo de Postgres/PostgREST", async () => {
    const user = await createAuthenticatedUser("ninguno");
    userIds.push(user.userId);
    await loguearEnJar(user.email);

    // Rompe la garantía "existe exactamente 1 fila propia" borrando la fila de
    // `profiles` directamente (auth.users sigue existiendo, la sesión sigue siendo
    // válida): `.single()` sobre 0 filas es un error real de PostgREST, no un mock.
    const { error: deleteError } = await admin.from("profiles").delete().eq("id", user.userId);
    expect(deleteError).toBeNull();

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "No se pudo leer el perfil." });
    // Nunca el mensaje crudo de Postgres/PostgREST (código de error, nombre de
    // tabla/columna, etc.) — sólo el mensaje genérico de arriba.
    expect(JSON.stringify(body)).not.toMatch(/PGRST|relation|column|constraint|postgres/i);
  });
});
