import type { NivelAcceso, RolUsuario } from "../../lib/database.types";

export interface SeedUserDefinition {
  email: string;
  password: string;
  nivel: NivelAcceso;
  rol: RolUsuario;
}

// Dominio reservado que marca CUALQUIER usuario creado por los tests, sea
// del seed o ad hoc (createAuthenticatedUser, un registro real en un E2E).
// Es el mecanismo de identificación que pide VGRP-43: como los tests corren
// contra el mismo proyecto Supabase que la app (no hay base separada, por
// costo — ver docs/TESTING.md), TODO dato de test tiene que quedar
// reconocible para que cleanup.ts lo pueda borrar sin arriesgar tocar un
// usuario real. Nunca generar un email de test que no termine así.
export const TEST_EMAIL_SUFFIX = "@test.og-circle.invalid";

export function isTestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(TEST_EMAIL_SUFFIX);
}

// Contraseña de los usuarios seed. Sale de la variable de entorno
// `SEED_USERS_PASSWORD` y NO está en el repo: el repo es público y estos usuarios
// existen en la base real (una cuenta admin con contraseña conocida = acceso total
// al panel). Es un getter perezoso para que importar este módulo (p. ej. para
// `TEST_EMAIL_SUFFIX`) no exija la variable; sólo falla quien realmente la usa.
// Ver docs/TESTING.md ("Contraseña de los usuarios seed").
function seedPassword(): string {
  const valor = process.env.SEED_USERS_PASSWORD;
  if (!valor) {
    throw new Error(
      "Falta SEED_USERS_PASSWORD (la contraseña de los usuarios seed). Ver docs/TESTING.md.",
    );
  }
  return valor;
}

// Un usuario fijo por cada nivel de acceso más un admin, tal como pide
// VGRP-43. Son usuarios de test reconocibles por TEST_EMAIL_SUFFIX, nunca se
// crean con este patrón fuera de tests.
//
// VGRP-59/60 (Bloque 13 — plan único): el enum pasó de tres valores
// (ninguno/principiante/avanzado) a dos (ninguno/completo). Se mantienen los
// emails `principiante@...`/`avanzado@...` para no invalidar usuarios seed ya
// existentes en el proyecto real de test — ambos apuntan ahora a `nivel:
// "completo"` (el único plan pago).
export const SEED_USERS: readonly SeedUserDefinition[] = [
  {
    email: `ninguno${TEST_EMAIL_SUFFIX}`,
    get password() {
      return seedPassword();
    },
    nivel: "ninguno",
    rol: "user",
  },
  {
    email: `principiante${TEST_EMAIL_SUFFIX}`,
    get password() {
      return seedPassword();
    },
    nivel: "completo",
    rol: "user",
  },
  {
    email: `avanzado${TEST_EMAIL_SUFFIX}`,
    get password() {
      return seedPassword();
    },
    nivel: "completo",
    rol: "user",
  },
  {
    email: `admin${TEST_EMAIL_SUFFIX}`,
    get password() {
      return seedPassword();
    },
    nivel: "completo",
    rol: "admin",
  },
] as const;

export function findSeedUser(nivel: NivelAcceso): SeedUserDefinition {
  const user = SEED_USERS.find((u) => u.nivel === nivel && u.rol === "user");
  if (!user) {
    throw new Error(`No hay usuario seed para nivel "${nivel}".`);
  }
  return user;
}

export const SEED_ADMIN_USER: SeedUserDefinition = SEED_USERS[3];
