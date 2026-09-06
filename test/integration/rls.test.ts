// VGRP-44 (sección "RLS", cubre VGRP-15) — el bloque de tests más importante
// de toda la fase: acá NO se prueba "que funcione", se prueba "que no se
// pueda hacer lo que no se debe". Tests de integración de verdad contra el
// proyecto real de Supabase (no hay base de test separada, ver
// docs/TESTING.md).
//
// Regla no negociable de este archivo: las ASERCIONES de RLS se hacen siempre
// con el cliente/token del usuario real (anon + signInWithPassword, o el
// access_token de createAuthenticatedUser/getTokenWithClaim). El cliente admin
// (service_role) sólo se usa para arrange/cleanup y para las llamadas a
// withPolicyDisabled — service_role bypasea RLS por completo, así que si se
// usara para las aserciones todos los tests "pasarían" sin que la policy
// exista.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthenticatedUser } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import { withPolicyDisabled } from "../helpers/rls-toggle";
import { SEED_ADMIN_USER } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

const admin = createTestAdminClient();

// Password fija que usa createAuthenticatedUser cuando no se le pasa una
// explícita (ver test/helpers/auth.ts) — mismo patrón que claims.test.ts para
// volver a loguearse con un cliente propio en vez de reusar el accessToken
// de creación con setSession (que necesitaría un refresh_token real).
const PASSWORD_USUARIO_AD_HOC = "test-password-1!";

/**
 * Crea un usuario ad hoc y devuelve un cliente YA logueado como ese usuario
 * (nunca el cliente admin) junto con su userId. Es el punto de partida de
 * casi todos los tests de este archivo: necesitamos un token real de un
 * usuario real para que RLS tenga algo que evaluar.
 */
async function crearUsuarioLogueado(nivel: "ninguno" | "principiante" | "avanzado" = "ninguno") {
  const created = await createAuthenticatedUser(nivel);
  const client = createTestAnonClient();
  const { error } = await withAuthRetry(() =>
    client.auth.signInWithPassword({ email: created.email, password: PASSWORD_USUARIO_AD_HOC }),
  );
  if (error) throw error;
  return { client, userId: created.userId, email: created.email };
}

describe("profiles_select_own: un usuario no lee la fila de profiles de otro (VGRP-15)", () => {
  let userAId: string | null = null;
  let userBId: string | null = null;

  afterEach(async () => {
    if (userAId) await cleanupUser(userAId);
    if (userBId) await cleanupUser(userBId);
    userAId = null;
    userBId = null;
  });

  it("el usuario B no puede leer profiles del usuario A (0 filas, no error)", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;
    const userB = await crearUsuarioLogueado();
    userBId = userB.userId;

    // RLS no devuelve un error de permisos: la fila simplemente no aparece
    // en el resultado, como si no existiera. Por eso la aserción correcta acá
    // es "0 filas", no "hay un error".
    const { data, error } = await userB.client.from("profiles").select().eq("id", userAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("en cambio, el usuario A SÍ puede leer su propia fila de profiles", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;

    const { data, error } = await userA.client.from("profiles").select().eq("id", userAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(userAId);
  });

  // Verificación de que el test de arriba realmente depende de la policy
  // (criterio de VGRP-44 "un test de RLS que pasa con la policy desactivada
  // es un test roto"). IMPORTANTE — esto NO prueba "sin la policy, cualquiera
  // lee cualquier fila": se comprobó empíricamente que profiles_select_own es
  // la ÚNICA policy de SELECT sobre profiles, y el comportamiento por defecto
  // de RLS en Postgres cuando CERO policies aplican a una operación es
  // denegar TODO (no "permitir todo") — está documentado así en la doc de
  // Postgres ("a default-deny policy is used"). Borrar la única policy de
  // SELECT no abre la tabla a otros usuarios: la cierra por completo, incluso
  // para el dueño de la fila. Es exactamente esa denegación total la que
  // demuestra la dependencia: el test hermano de arriba ("el usuario A SÍ
  // puede leer su propia fila") pasa de 1 fila a 0 sin esta policy.
  it("SIN profiles_select_own, ni siquiera el propio dueño puede leer su fila de profiles (confirma que la policy real protege)", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;

    await withPolicyDisabled(admin, "public", "profiles", "profiles_select_own", async () => {
      const { data, error } = await userA.client.from("profiles").select().eq("id", userA.userId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0); // con la policy activa, el test hermano de arriba espera 1
    });
  });
});

describe("inmutabilidad de profiles.nivel y profiles.rol (VGRP-15)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) await cleanupUser(userId);
    userId = null;
  });

  // El mecanismo NO es una policy de RLS: es "revoke all" + "grant update
  // (nombre, telefono, progreso)" (sección 6 de la migración de esquema) más
  // el trigger profiles_guard_nivel_rol_trigger como segunda capa. Un UPDATE
  // que toca una columna sin permiso de grant falla con un error de Postgres
  // (42501, insufficient_privilege) antes de que RLS llegue siquiera a
  // evaluar la policy — por eso NO tiene sentido usar withPolicyDisabled acá:
  // desactivar profiles_update_own no cambiaría este resultado en absoluto.
  it("el usuario no puede modificar su propio nivel con un update directo", async () => {
    const user = await crearUsuarioLogueado("ninguno");
    userId = user.userId;

    const { error } = await user.client
      .from("profiles")
      .update({ nivel: "avanzado" })
      .eq("id", userId);

    expect(error).not.toBeNull();

    // Confirmamos con el cliente admin que el nivel efectivamente no cambió
    // en la base (no basta con que la llamada haya devuelto error).
    const { data: profile } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", userId)
      .single();
    expect(profile?.nivel).toBe("ninguno");
  });

  it("el usuario no puede auto-asignarse rol='admin' con un update directo", async () => {
    const user = await crearUsuarioLogueado("ninguno");
    userId = user.userId;

    const { error } = await user.client.from("profiles").update({ rol: "admin" }).eq("id", userId);

    expect(error).not.toBeNull();

    const { data: profile } = await admin.from("profiles").select("rol").eq("id", userId).single();
    expect(profile?.rol).toBe("user");
  });

  it("un update que SÍ toca sólo columnas permitidas (nombre) funciona normalmente", async () => {
    // Control: confirma que el rechazo de arriba es específico de
    // nivel/rol y no que el usuario no puede actualizar profiles en absoluto.
    const user = await crearUsuarioLogueado("ninguno");
    userId = user.userId;

    const { error } = await user.client
      .from("profiles")
      .update({ nombre: "Nombre De Test" })
      .eq("id", userId);

    expect(error).toBeNull();

    const { data: profile } = await admin
      .from("profiles")
      .select("nombre")
      .eq("id", userId)
      .single();
    expect(profile?.nombre).toBe("Nombre De Test");
  });
});

describe("pagos_select_own: un usuario sólo lee sus propias filas de pagos (VGRP-15)", () => {
  let userAId: string | null = null;
  let userBId: string | null = null;
  let pagoId: string | null = null;

  afterEach(async () => {
    // El pago de userA se borra igual al limpiar userA (cleanupUser borra sus
    // FK dependientes), pero lo borramos explícito primero por las dudas de
    // que un test anterior haya fallado a mitad de camino.
    if (pagoId) {
      await admin.from("pagos").delete().eq("id", pagoId);
      pagoId = null;
    }
    if (userAId) await cleanupUser(userAId);
    if (userBId) await cleanupUser(userBId);
    userAId = null;
    userBId = null;
  });

  async function crearPagoParaUsuario(userId: string) {
    const { data, error } = await admin
      .from("pagos")
      .insert({
        user_id: userId,
        proveedor: "mercadopago",
        proveedor_ref: `test-rls-${randomUUID()}`,
        nivel_comprado: "principiante",
        monto_ars: 1000,
        estado: "approved",
        payload_raw: {},
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  it("el usuario B no ve el pago del usuario A", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;
    const userB = await crearUsuarioLogueado();
    userBId = userB.userId;
    pagoId = await crearPagoParaUsuario(userAId);

    const { data, error } = await userB.client.from("pagos").select().eq("id", pagoId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("en cambio, el usuario A SÍ ve su propio pago", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;
    pagoId = await crearPagoParaUsuario(userAId);

    const { data, error } = await userA.client.from("pagos").select().eq("id", pagoId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(pagoId);
  });

  // Verificación de que el test real depende de la policy (mismo hallazgo que
  // en profiles: pagos_select_own es la ÚNICA policy de SELECT sobre pagos,
  // y RLS en Postgres deniega TODO por defecto cuando cero policies aplican a
  // una operación — no "permite todo". Borrarla no expone el pago de A a B,
  // lo esconde también del propio dueño. Esa denegación total es la prueba de
  // que el test hermano de arriba ("el usuario A SÍ ve su propio pago")
  // depende de esta policy.
  it("SIN pagos_select_own, ni siquiera el dueño puede leer su propio pago (confirma que la policy real protege)", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;
    pagoId = await crearPagoParaUsuario(userAId);
    const pagoIdCreado = pagoId;

    await withPolicyDisabled(admin, "public", "pagos", "pagos_select_own", async () => {
      const { data, error } = await userA.client.from("pagos").select().eq("id", pagoIdCreado);
      expect(error).toBeNull();
      expect(data).toHaveLength(0); // con la policy activa, el test hermano de arriba espera 1
    });
  });

  it("pagos rechaza UPDATE desde el rol authenticated, incluso sobre la propia fila", async () => {
    // No hay policy de update para authenticated (sección 7 de la migración),
    // así que esto queda denegado por RLS aunque el dueño de la fila sea
    // quien lo intente.
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;
    pagoId = await crearPagoParaUsuario(userAId);

    const { error } = await userA.client
      .from("pagos")
      .update({ estado: "refunded" })
      .eq("id", pagoId);

    expect(error).not.toBeNull();

    const { data: pago } = await admin.from("pagos").select("estado").eq("id", pagoId).single();
    expect(pago?.estado).toBe("approved");
  });

  it("pagos rechaza DELETE desde el rol authenticated, incluso sobre la propia fila", async () => {
    const userA = await crearUsuarioLogueado();
    userAId = userA.userId;
    pagoId = await crearPagoParaUsuario(userAId);

    const { error } = await userA.client.from("pagos").delete().eq("id", pagoId);

    expect(error).not.toBeNull();

    const { data: pago } = await admin.from("pagos").select("id").eq("id", pagoId).single();
    expect(pago?.id).toBe(pagoId);
  });
});

describe("admin_audit_log_select_admin: sólo un rol=admin lee la auditoría (VGRP-15, extra no listado en el checklist literal)", () => {
  let actorId: string | null = null;
  let auditId: string | null = null;

  afterEach(async () => {
    if (auditId) {
      await admin.from("admin_audit_log").delete().eq("id", auditId);
      auditId = null;
    }
    if (actorId) await cleanupUser(actorId);
    actorId = null;
  });

  async function crearFilaDeAuditoria(actor: string) {
    const { data, error } = await admin
      .from("admin_audit_log")
      .insert({
        actor_id: actor,
        accion: "test-rls-audit",
        entidad: "profiles",
        entidad_id: actor,
        valor_anterior: { nivel: "ninguno" },
        valor_nuevo: { nivel: "avanzado" },
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  it("un usuario con rol='user' no puede leer admin_audit_log", async () => {
    const user = await crearUsuarioLogueado();
    actorId = user.userId;
    auditId = await crearFilaDeAuditoria(actorId);

    const { data, error } = await user.client.from("admin_audit_log").select().eq("id", auditId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("el usuario seed admin (rol='admin' en el JWT) sí puede leer admin_audit_log", async () => {
    const user = await crearUsuarioLogueado();
    actorId = user.userId;
    auditId = await crearFilaDeAuditoria(actorId);

    const adminAnon = createTestAnonClient();
    const { error: signInError } = await withAuthRetry(() =>
      adminAnon.auth.signInWithPassword({
        email: SEED_ADMIN_USER.email,
        password: SEED_ADMIN_USER.password,
      }),
    );
    expect(signInError).toBeNull();

    const { data, error } = await adminAnon.from("admin_audit_log").select().eq("id", auditId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(auditId);
  });

  // VGRP-35 (35-T10) — EL test que pone CI en rojo si alguien desactiva la
  // policy. Mismo hallazgo que profiles/pagos: `admin_audit_log_select_admin`
  // es la ÚNICA policy de SELECT sobre la tabla, y RLS en Postgres deniega
  // TODO por defecto cuando cero policies aplican a una operación. Desactivarla
  // no abre la tabla — la cierra por completo, incluso para el propio admin.
  // Esa denegación total es la prueba de que el test hermano de arriba ("el
  // usuario seed admin sí puede leer") depende de esta policy.
  it("SIN admin_audit_log_select_admin, ni siquiera el usuario admin lee la tabla (confirma que la policy real protege)", async () => {
    const user = await crearUsuarioLogueado();
    actorId = user.userId;
    auditId = await crearFilaDeAuditoria(actorId);
    const auditIdCreado = auditId;

    const adminAnon = createTestAnonClient();
    const { error: signInError } = await withAuthRetry(() =>
      adminAnon.auth.signInWithPassword({
        email: SEED_ADMIN_USER.email,
        password: SEED_ADMIN_USER.password,
      }),
    );
    expect(signInError).toBeNull();

    await withPolicyDisabled(
      admin,
      "public",
      "admin_audit_log",
      "admin_audit_log_select_admin",
      async () => {
        const { data, error } = await adminAnon
          .from("admin_audit_log")
          .select()
          .eq("id", auditIdCreado);
        expect(error).toBeNull();
        expect(data).toHaveLength(0); // con la policy activa, el test hermano espera 1
      },
    );
  });
});

// Criterio del ticket: "un token de nivel principiante no ve contenido de
// avanzado" y "un usuario ninguno no lee contenido de ningún nivel pago". El
// esquema actual (profiles / pagos / admin_audit_log / leads, ver
// supabase/migrations/20260822035923_init_plataforma.sql) NO tiene ninguna
// tabla de "contenido" gateado por nivel todavía — no hay cursos, módulos, ni
// nada parecido que una policy de RLS pudiera proteger por nivel. Forzar acá
// una tabla o un test fabricado no probaría nada real, así que se documenta
// como pendiente explícito en vez de simular una garantía que hoy no existe.
it.todo(
  "gating de contenido por nivel (principiante no ve avanzado, ninguno no ve contenido pago): " +
    "no hay ninguna tabla de contenido en el esquema actual (profiles/pagos/admin_audit_log/leads) " +
    "para aplicarle una policy de RLS por nivel — se retoma cuando exista esa tabla.",
);
