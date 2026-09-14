// VGRP-52 (cubre VGRP-33) — tests de integración de verdad contra el proyecto real de
// Supabase (docs/TESTING.md) para `actualizarPerfil()` (app/(app)/perfil/_actions.ts):
// única escritura de usuario sobre `profiles` fuera del panel admin, y hueco total de
// tests hasta este ticket.
//
// Mismo mecanismo que `test/integration/auth-actions.test.ts` (comentario grande al
// inicio de ese archivo, no repetido acá): `actualizarPerfil()` usa
// `createSupabaseServerClient()`/`getVerifiedClaims()` (lib/auth/server.ts), que
// dependen de `cookies()` de `next/headers` — ininvocable fuera de un Server
// Action/Route Handler real. Se mockea `next/headers` con un cookie jar en memoria
// compatible de verdad con `@supabase/ssr` (nunca se fabrica el formato de cookie a
// mano); Supabase en sí sigue siendo 100% real (service_role + anon contra el proyecto
// de verdad).
//
// También se mockea `next/cache` (`revalidatePath`): confirmado a mano (ver el reporte
// del ticket) que llamarlo fuera de un request real de Next tira
// "Invariant: static generation store missing" — el mock es lo que permite que el
// happy path corra sin explotar, mismo criterio que route.test.ts mockea
// `revalidateTag` en VGRP-46/52.

import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../lib/database.types";
import { createAuthenticatedUser } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import "../helpers/load-env";
import { withAuthRetry } from "../helpers/with-auth-retry";

const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser, ver auth.ts

let cookieJar: Map<string, string>;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

beforeEach(() => {
  cookieJar = new Map();
  mockRevalidatePath.mockClear();
});

// Import DESPUÉS de los `vi.mock` de arriba (hoisted igual, ver el mismo comentario en
// auth-actions.test.ts).
const { actualizarPerfil } = await import("../../app/(app)/perfil/_actions");
const { INITIAL_ACTION_STATE } = await import("../../app/(app)/perfil/_schemas");

const admin = createTestAdminClient();

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(campos)) fd.set(key, value);
  return fd;
}

/** Mismo cliente por dentro que usa `createSupabaseServerClient()` — apuntado al
 * `cookieJar` del test actual, para "empujar" una sesión ya lograda. */
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

/** Loguea `email` (password fija de createAuthenticatedUser) y empuja la sesión
 * resultante al `cookieJar` compartido — como si el usuario ya hubiera iniciado sesión
 * antes de llegar al Server Action. */
async function loguear(email: string): Promise<void> {
  const anon = createTestAnonClient();
  const { data, error } = await withAuthRetry(() =>
    anon.auth.signInWithPassword({ email, password: PASSWORD }),
  );
  if (error || !data.session) {
    throw new Error(`No se pudo loguear ${email} para el test: ${error?.message ?? "sin sesión"}`);
  }
  const { error: setSessionError } = await clienteDeJar().auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setSessionError) throw setSessionError;
}

describe("actualizarPerfil — VGRP-33/VGRP-52", () => {
  it("sin sesión: mensaje de error fijo, nunca llega a tocar profiles", async () => {
    // cookieJar vacío (del beforeEach de arriba): getVerifiedClaims() resuelve null.
    const resultado = await actualizarPerfil(
      INITIAL_ACTION_STATE,
      formData({ nombre: "Nombre Cualquiera", telefono: "+54 9 11 5555-0000" }),
    );

    expect(resultado.error).toBe("Tenés que iniciar sesión para editar tu perfil.");
    expect(resultado.fieldErrors).toBeUndefined();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  describe("validación Zod corre en el servidor: cero escrituras cuando falla", () => {
    let userId: string;
    let email: string;
    let nombreOriginal: string | null;
    let telefonoOriginal: string | null;

    beforeAll(async () => {
      const created = await createAuthenticatedUser("principiante");
      userId = created.userId;
      email = created.email;

      const { data, error } = await admin
        .from("profiles")
        .select("nombre, telefono")
        .eq("id", userId)
        .single();
      if (error) throw error;
      nombreOriginal = data.nombre;
      telefonoOriginal = data.telefono;
    });

    afterAll(async () => {
      await cleanupUser(userId);
    });

    // El beforeEach de arriba (top-level) ya vació cookieJar antes de cada test de este
    // describe — hay que loguearse de nuevo en cada uno.
    beforeEach(async () => {
      await loguear(email);
    });

    async function confirmarSinCambios() {
      const { data, error } = await admin
        .from("profiles")
        .select("nombre, telefono")
        .eq("id", userId)
        .single();
      expect(error).toBeNull();
      expect(data?.nombre).toBe(nombreOriginal);
      expect(data?.telefono).toBe(telefonoOriginal);
    }

    it("nombre vacío -> fieldErrors.nombre, sin escrituras", async () => {
      const resultado = await actualizarPerfil(
        INITIAL_ACTION_STATE,
        formData({ nombre: "", telefono: "+54 9 11 5555-1111" }),
      );
      expect(resultado.fieldErrors?.nombre?.[0]).toBeTruthy();
      expect(resultado.mensaje).toBeUndefined();
      await confirmarSinCambios();
    });

    it("nombre de más de 120 caracteres -> fieldErrors.nombre, sin escrituras", async () => {
      const resultado = await actualizarPerfil(
        INITIAL_ACTION_STATE,
        formData({ nombre: "a".repeat(121), telefono: "+54 9 11 5555-1111" }),
      );
      expect(resultado.fieldErrors?.nombre?.[0]).toBeTruthy();
      await confirmarSinCambios();
    });

    it("teléfono de menos de 6 caracteres -> fieldErrors.telefono, sin escrituras", async () => {
      const resultado = await actualizarPerfil(
        INITIAL_ACTION_STATE,
        formData({ nombre: "Nombre Válido", telefono: "123" }),
      );
      expect(resultado.fieldErrors?.telefono?.[0]).toBeTruthy();
      await confirmarSinCambios();
    });

    it("teléfono de más de 30 caracteres -> fieldErrors.telefono, sin escrituras", async () => {
      const resultado = await actualizarPerfil(
        INITIAL_ACTION_STATE,
        formData({ nombre: "Nombre Válido", telefono: "1".repeat(31) }),
      );
      expect(resultado.fieldErrors?.telefono?.[0]).toBeTruthy();
      await confirmarSinCambios();
    });
  });

  describe("happy path", () => {
    let userId: string | null = null;

    afterEach(async () => {
      if (userId) {
        await cleanupUser(userId);
        userId = null;
      }
    });

    it("actualiza profiles.nombre/telefono de verdad en la base y llama a revalidatePath('/perfil')", async () => {
      const created = await createAuthenticatedUser("principiante");
      userId = created.userId;
      await loguear(created.email);

      const nuevoNombre = `Nombre Actualizado ${randomUUID()}`;
      const nuevoTelefono = "+54 9 11 4444-9999";
      const resultado = await actualizarPerfil(
        INITIAL_ACTION_STATE,
        formData({ nombre: nuevoNombre, telefono: nuevoTelefono }),
      );

      expect(resultado.mensaje).toBe("Guardado.");
      expect(resultado.error).toBeUndefined();
      expect(resultado.fieldErrors).toBeUndefined();

      const { data, error } = await admin
        .from("profiles")
        .select("nombre, telefono")
        .eq("id", userId)
        .single();
      expect(error).toBeNull();
      expect(data?.nombre).toBe(nuevoNombre);
      expect(data?.telefono).toBe(nuevoTelefono);

      expect(mockRevalidatePath).toHaveBeenCalledWith("/perfil");
    });

    it("LA GARANTÍA DURA: un FormData con nivel/rol agregados a mano NO cambia profiles.nivel/rol (probado contra la base real)", async () => {
      const created = await createAuthenticatedUser("principiante", "user");
      userId = created.userId;
      await loguear(created.email);

      const fd = formData({
        nombre: "Intento de escalar privilegios",
        telefono: "+54 9 11 5555-2222",
      });
      // Nadie en el <form> real manda estos campos — un FormData armado a mano (o un
      // atacante con devtools) sí podría. `perfilSchema` sólo lee `nombre`/`telefono` de
      // acá, así que esto no debería llegar ni siquiera a construir el `.update()`.
      fd.set("nivel", "avanzado");
      fd.set("rol", "admin");

      const resultado = await actualizarPerfil(INITIAL_ACTION_STATE, fd);
      expect(resultado.mensaje).toBe("Guardado.");

      const { data, error } = await admin
        .from("profiles")
        .select("nivel, rol, nombre")
        .eq("id", userId)
        .single();
      expect(error).toBeNull();
      expect(data?.nivel).toBe("principiante");
      expect(data?.rol).toBe("user");
      expect(data?.nombre).toBe("Intento de escalar privilegios");
    });

    it("un usuario sólo edita su propia fila: el .eq('id', userId) usa el claim propio, nunca un id ajeno", async () => {
      const userA = await createAuthenticatedUser("principiante");
      const userB = await createAuthenticatedUser("avanzado");
      userId = userA.userId; // limpiado por el afterEach; userB se limpia acá abajo.

      try {
        const { data: filaBAntes, error: errorBAntes } = await admin
          .from("profiles")
          .select("nombre")
          .eq("id", userB.userId)
          .single();
        expect(errorBAntes).toBeNull();

        await loguear(userA.email);
        const resultado = await actualizarPerfil(
          INITIAL_ACTION_STATE,
          formData({ nombre: "Sólo mi propio perfil", telefono: "+54 9 11 5555-3333" }),
        );
        expect(resultado.mensaje).toBe("Guardado.");

        const { data: filaA } = await admin
          .from("profiles")
          .select("nombre")
          .eq("id", userA.userId)
          .single();
        expect(filaA?.nombre).toBe("Sólo mi propio perfil");

        const { data: filaBDespues } = await admin
          .from("profiles")
          .select("nombre")
          .eq("id", userB.userId)
          .single();
        expect(filaBDespues?.nombre).toBe(filaBAntes?.nombre);
      } finally {
        await cleanupUser(userB.userId);
      }
    });
  });
});
