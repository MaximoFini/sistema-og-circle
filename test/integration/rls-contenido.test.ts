// VGRP-49 (cierra el it.todo de VGRP-44 en rls.test.ts) — RLS de las 4 tablas
// de contenido que creó VGRP-38 (agentes, videos, profesionales,
// servicios_financieros), declaradas en
// supabase/migrations/20260909041306_contenido_agentes_videos_profesionales_servicios.sql
// ("red de seguridad VGRP-30 US-4"). Hueco total hasta este ticket: ninguna
// de las 4 policies tenía un test.
//
// Mismo criterio no negociable que rls.test.ts: las ASERCIONES se hacen
// siempre con el cliente/token de un usuario real (nunca service_role, que
// bypassea RLS por completo). El cliente admin sólo arma/limpia datos.
//
// Tokens reales via getTokenWithClaim() (los 3 usuarios seed no-admin) en vez
// de usuarios ad hoc: son 3 usuarios fijos y estables que ya existen (no hay
// que crearlos/loguearlos/borrarlos por test), lo que importa acá porque
// varios tickets hermanos corren en paralelo contra el mismo proyecto
// (docs/TESTING.md) y cada createAuthenticatedUser() de más es una llamada
// más a Supabase Auth compitiendo por el mismo rate limit.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "../../lib/database.types";
import { getEnv } from "../../lib/env";
import { getTokenWithClaim } from "../helpers/auth";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import "../helpers/load-env";
import { withPolicyDisabled } from "../helpers/rls-toggle";
import { TEST_EMAIL_SUFFIX } from "../helpers/seed-users";

const admin = createTestAdminClient();

/** Cliente PostgREST autenticado con un access_token real ya emitido (sin
 *  pasar por signInWithPassword de nuevo) — alcanza con inyectar el header
 *  Authorization, que es lo único que RLS necesita para evaluar el claim. */
function clienteConToken(accessToken: string) {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Marcador de datos de test para estas 4 tablas (cleanupUser/cleanupAllTestArtifacts
// de test/helpers/cleanup.ts NO las toca — ver docs/TESTING.md y el comentario
// grande de scripts/cleanup-test-data.ts). Cada fila que crea este archivo lleva
// este prefijo en nombre/título y se borra en afterEach por id; scripts/cleanup-test-data.ts
// suma un barrido explícito por si algo queda residual de una corrida cortada.
const MARCADOR = "[test] rls-contenido";

const idsCreados: {
  tabla: "agentes" | "videos" | "profesionales" | "servicios_financieros";
  id: string;
}[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const { tabla, id } = idsCreados.pop() as (typeof idsCreados)[number];
    await admin.from(tabla).delete().eq("id", id);
  }
});

async function crearAgente(valores: {
  nivel_requerido: "ninguno" | "principiante" | "avanzado";
  activo?: boolean;
  contacto?: string | null;
}) {
  const { data, error } = await admin
    .from("agentes")
    .insert({
      nombre: `${MARCADOR} agente ${randomUUID()}`,
      especialidad: "Test",
      nivel_requerido: valores.nivel_requerido,
      activo: valores.activo ?? true,
      contacto: valores.contacto ?? "contacto-secreto-de-test",
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push({ tabla: "agentes", id: data.id });
  return data;
}

async function crearVideo(valores: {
  nivel_requerido: "ninguno" | "principiante" | "avanzado";
  publicado?: boolean;
}) {
  const { data, error } = await admin
    .from("videos")
    .insert({
      stage: 1,
      titulo: `${MARCADOR} video ${randomUUID()}`,
      nivel_requerido: valores.nivel_requerido,
      publicado: valores.publicado ?? true,
      provider_ref: "provider-ref-secreto-de-test",
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push({ tabla: "videos", id: data.id });
  return data;
}

async function crearServicioFinanciero(valores: {
  nivel_requerido: "ninguno" | "principiante" | "avanzado";
  activo?: boolean;
}) {
  const { data, error } = await admin
    .from("servicios_financieros")
    .insert({
      titulo: `${MARCADOR} servicio ${randomUUID()}`,
      nivel_requerido: valores.nivel_requerido,
      activo: valores.activo ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push({ tabla: "servicios_financieros", id: data.id });
  return data;
}

async function crearProfesional(valores: { activo?: boolean }) {
  const { data, error } = await admin
    .from("profesionales")
    .insert({
      nombre: `${MARCADOR} profesional ${randomUUID()}`,
      rubro: "Test",
      activo: valores.activo ?? true,
      contacto: "contacto-secreto-de-test",
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push({ tabla: "profesionales", id: data.id });
  return data;
}

describe("agentes/videos/profesionales/servicios_financieros — anon: cero filas (VGRP-30 US-4)", () => {
  it("un cliente anon (sin sesión) no puede leer NINGUNA de las 4 tablas", async () => {
    // Sin grant a `anon` en absoluto (la migración sólo hace `grant select ...
    // to authenticated`), así que esto lo corta PostgREST ANTES de RLS —
    // mismo mecanismo que nivel_overrides/admin_pagos_ledger en rls.test.ts /
    // admin-pagos-ledger-rls.test.ts, no una policy de RLS con 0 filas.
    const anon = createTestAnonClient();

    for (const tabla of ["agentes", "videos", "profesionales", "servicios_financieros"] as const) {
      const { data, error } = await anon.from(tabla).select();
      expect(error, `${tabla}: se esperaba 42501 permission denied para anon`).not.toBeNull();
      expect(error?.code).toBe("42501");
      expect(data ?? []).toHaveLength(0);
    }
  });
});

describe("nivel='ninguno': cero filas de agentes/videos/servicios_financieros, SÍ ve profesionales activos", () => {
  it("agentes: nivel='ninguno' no ve una fila que requiere 'principiante'", async () => {
    const agente = await crearAgente({ nivel_requerido: "principiante" });
    const { accessToken } = await getTokenWithClaim("ninguno");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("videos: nivel='ninguno' no ve una fila que requiere 'principiante'", async () => {
    const video = await crearVideo({ nivel_requerido: "principiante" });
    const { accessToken } = await getTokenWithClaim("ninguno");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("videos").select().eq("id", video.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("servicios_financieros: nivel='ninguno' no ve una fila que requiere 'principiante'", async () => {
    const servicio = await crearServicioFinanciero({ nivel_requerido: "principiante" });
    const { accessToken } = await getTokenWithClaim("ninguno");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente
      .from("servicios_financieros")
      .select()
      .eq("id", servicio.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("profesionales: nivel='ninguno' SÍ ve una fila activa (decisión confirmada 2026-09-09, sin nivel_requerido)", async () => {
    const profesional = await crearProfesional({ activo: true });
    const { accessToken } = await getTokenWithClaim("ninguno");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("profesionales").select().eq("id", profesional.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(profesional.id);
  });
});

describe("principiante ve su nivel y NO ve avanzado (fila oculta entera, no sólo el contacto)", () => {
  it("agentes: principiante ve una fila nivel_requerido='principiante'", async () => {
    const agente = await crearAgente({ nivel_requerido: "principiante" });
    const { accessToken } = await getTokenWithClaim("principiante");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    // La fila entera está disponible acá (RLS no filtra columnas, sólo filas) —
    // es lib/data/agentes.ts + resolverSecreto() quien decide no mandar el
    // contacto a un cliente sin nivel; RLS es la red de seguridad si alguien
    // se saltea esa capa.
    expect(data?.[0]?.contacto).toBe("contacto-secreto-de-test");
  });

  it("agentes: principiante NO ve una fila nivel_requerido='avanzado' — la fila entera desaparece, no sólo el contacto", async () => {
    const agente = await crearAgente({ nivel_requerido: "avanzado" });
    const { accessToken } = await getTokenWithClaim("principiante");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("videos: principiante ve principiante y NO ve avanzado", async () => {
    const principiante = await crearVideo({ nivel_requerido: "principiante" });
    const avanzado = await crearVideo({ nivel_requerido: "avanzado" });
    const { accessToken } = await getTokenWithClaim("principiante");
    const cliente = clienteConToken(accessToken);

    const { data: dataPrincipiante, error: errorPrincipiante } = await cliente
      .from("videos")
      .select()
      .eq("id", principiante.id);
    expect(errorPrincipiante).toBeNull();
    expect(dataPrincipiante).toHaveLength(1);

    const { data: dataAvanzado, error: errorAvanzado } = await cliente
      .from("videos")
      .select()
      .eq("id", avanzado.id);
    expect(errorAvanzado).toBeNull();
    expect(dataAvanzado).toHaveLength(0);
  });

  it("servicios_financieros: principiante ve principiante y NO ve avanzado", async () => {
    const principiante = await crearServicioFinanciero({ nivel_requerido: "principiante" });
    const avanzado = await crearServicioFinanciero({ nivel_requerido: "avanzado" });
    const { accessToken } = await getTokenWithClaim("principiante");
    const cliente = clienteConToken(accessToken);

    const { data: dataPrincipiante } = await cliente
      .from("servicios_financieros")
      .select()
      .eq("id", principiante.id);
    expect(dataPrincipiante).toHaveLength(1);

    const { data: dataAvanzado } = await cliente
      .from("servicios_financieros")
      .select()
      .eq("id", avanzado.id);
    expect(dataAvanzado).toHaveLength(0);
  });
});

describe("avanzado ve tanto 'principiante' como 'avanzado' — y pin del ORDEN de declaración del enum", () => {
  // El enum se declara `('ninguno', 'principiante', 'avanzado')`
  // (20260822035923_init_plataforma.sql) y la policy compara con `<=` sobre
  // ese orden de DECLARACIÓN, no alfabético. Alfabéticamente "avanzado" <
  // "ninguno" < "principiante": si la comparación fuera alfabética, un claim
  // 'avanzado' (el más chico alfabéticamente) NO vería una fila
  // nivel_requerido='principiante' (alfabéticamente mayor). Este test falla
  // exactamente así si un futuro `ALTER TYPE` reordenara el enum sin que
  // nadie se diera cuenta.
  it("agentes: avanzado ve una fila que requiere sólo 'principiante' (confirma orden de declaración, no alfabético)", async () => {
    const agente = await crearAgente({ nivel_requerido: "principiante" });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("agentes: avanzado también ve una fila que requiere 'avanzado'", async () => {
    const agente = await crearAgente({ nivel_requerido: "avanzado" });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.contacto).toBe("contacto-secreto-de-test");
  });
});

describe("activo=false / publicado=false: invisible para cualquier nivel, incluido avanzado", () => {
  it("agentes: activo=false invisible incluso para avanzado", async () => {
    const agente = await crearAgente({ nivel_requerido: "ninguno", activo: false });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("videos: publicado=false invisible incluso para avanzado", async () => {
    const video = await crearVideo({ nivel_requerido: "ninguno", publicado: false });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("videos").select().eq("id", video.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("servicios_financieros: activo=false invisible incluso para avanzado", async () => {
    const servicio = await crearServicioFinanciero({ nivel_requerido: "ninguno", activo: false });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente
      .from("servicios_financieros")
      .select()
      .eq("id", servicio.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("profesionales: activo=false invisible incluso para avanzado", async () => {
    const profesional = await crearProfesional({ activo: false });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    const { data, error } = await cliente.from("profesionales").select().eq("id", profesional.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe("un autenticado no puede INSERT/UPDATE/DELETE en ninguna de las 4 tablas (grant es sólo select)", () => {
  it.each(["agentes", "videos", "profesionales", "servicios_financieros"] as const)(
    "%s: INSERT/UPDATE/DELETE rechazados para authenticated",
    async (tabla) => {
      const { accessToken } = await getTokenWithClaim("avanzado");
      const cliente = clienteConToken(accessToken);

      const insertPayload =
        tabla === "agentes"
          ? { nombre: "x", especialidad: "x" }
          : tabla === "videos"
            ? { stage: 1, titulo: "x" }
            : tabla === "servicios_financieros"
              ? { titulo: "x" }
              : { nombre: "x", rubro: "x" };

      const { error: insertError } = await cliente.from(tabla).insert(insertPayload as never);
      expect(insertError, `${tabla}: INSERT debería fallar para authenticated`).not.toBeNull();

      const { error: updateError } = await cliente
        .from(tabla)
        .update({ orden: 999 } as never)
        .eq("id", "00000000-0000-0000-0000-000000000000");
      expect(updateError, `${tabla}: UPDATE debería fallar para authenticated`).not.toBeNull();

      const { error: deleteError } = await cliente
        .from(tabla)
        .delete()
        .eq("id", "00000000-0000-0000-0000-000000000000");
      expect(deleteError, `${tabla}: DELETE debería fallar para authenticated`).not.toBeNull();
    },
  );
});

describe("claim de nivel ausente o inválido: comportamiento REAL de hoy (VGRP-49)", () => {
  // El Custom Access Token Hook (supabase/migrations/20260822035925_auth_hook.sql)
  // SIEMPRE sobreescribe `app_metadata.nivel` con `profiles.nivel` — una
  // columna tipada como el enum `nivel_acceso` — en CADA login. Por
  // construcción, un JWT real emitido por este proyecto nunca puede traer un
  // `app_metadata.nivel` ausente (el hook cae a 'ninguno', no a "ausente") ni
  // inválido (la columna de origen no admite otro valor que el enum). Esto no
  // se puede simular fabricando un JWT propio: no tenemos la clave privada
  // ES256 del proyecto (mismo límite ya documentado en
  // test/integration/claims.test.ts). El comportamiento real verificable acá
  // es doble:
  it("la columna profiles.nivel (origen del claim) rechaza cualquier valor fuera del enum — por eso el claim nunca puede ser 'inválido' vía un login real", async () => {
    // Bug real de TEST encontrado corriendo esto por primera vez contra la base real
    // (ninguno de los 4 agentes de Bloque 9 pudo correr la suite real antes de este
    // paso de integración — ver docs/TESTING.md): la suposición original de este test
    // ("el UPDATE falla ANTES de buscar la fila, porque Postgres valida el literal al
    // parsear el statement") es FALSA para un UPDATE con service_role sobre un id que
    // no matchea ninguna fila. Confirmado directo contra Supabase real: un
    // `.update({ nivel: "nivel-inventado" }).eq("id", "<uuid inexistente>")` vuelve
    // `{ data: [], error: null, status: 200 }` — con cero filas a tocar, el target
    // list del UPDATE nunca se evalúa fila por fila y el literal jamás se castea
    // contra el enum. Un INSERT con el mismo valor inválido SÍ falla siempre
    // (`22P02 invalid input value for enum`), confirmando que la columna es un enum
    // real; lo que hacía falta corregir era el WHERE, no la columna. Se usa acá el id
    // real del seed "ninguno" (existe siempre, ver test/helpers/seed-users.ts) para
    // que el UPDATE matchee una fila de verdad y dispare la validación real — Postgres
    // aborta el UPDATE completo ante el error de tipo, así que la fila del seed NUNCA
    // llega a mutarse (confirmado: sigue en 'ninguno' después de este test).
    const { data: seedNinguno, error: seedError } = await admin
      .from("profiles")
      .select("id, nivel")
      .eq("email", `ninguno${TEST_EMAIL_SUFFIX}`)
      .single();
    if (seedError || !seedNinguno) {
      throw new Error(
        `No se encontró el usuario seed "ninguno${TEST_EMAIL_SUFFIX}". ¿Corriste \`pnpm db:seed:test\`?`,
      );
    }

    const { error } = await admin
      .from("profiles")
      .update({ nivel: "nivel-inventado" as never })
      .eq("id", seedNinguno.id);
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/invalid input value for enum/i);

    // Confirma que el UPDATE realmente abortó sin tocar la fila (no sólo que devolvió
    // un error de forma).
    const { data: sinCambios } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", seedNinguno.id)
      .single();
    expect(sinCambios?.nivel).toBe(seedNinguno.nivel);
  });

  it("un token real con la firma corrompida (mismo mecanismo que claims.test.ts) es rechazado por PostgREST antes de llegar a evaluar RLS — nunca devuelve una fila real", async () => {
    const { accessToken } = await getTokenWithClaim("avanzado");
    const [header, payload, signature] = accessToken.split(".");
    const idx = Math.floor(payload.length / 2);
    const charOriginal = payload[idx];
    const charMutado = charOriginal === "A" ? "B" : "A";
    const payloadMutado = payload.slice(0, idx) + charMutado + payload.slice(idx + 1);
    const tokenCorrompido = `${header}.${payloadMutado}.${signature}`;

    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const response = await fetch(`${url}/rest/v1/agentes?select=id,contacto`, {
      headers: { Authorization: `Bearer ${tokenCorrompido}`, apikey: anonKey },
    });

    // No se presume un código exacto (PostgREST puede rechazar la firma antes
    // de RLS, o GoTrue puede hacerlo antes de llegar a PostgREST) — lo que
    // esta garantía pide es que NUNCA sea un 200 con datos reales.
    const body: unknown = await response.json().catch(() => null);
    expect(response.status).not.toBe(200);
    expect(JSON.stringify(body)).not.toContain("contacto-secreto-de-test");
  });
});

describe("verificación de que el test sirve: SIN agentes_select_por_nivel, ni un usuario avanzado ve las filas (VGRP-49, criterio de aceptación 'romper a propósito')", () => {
  it("desactivar la policy hace que incluso avanzado quede en 0 filas — confirma que el test de arriba depende de la policy real", async () => {
    const agente = await crearAgente({ nivel_requerido: "avanzado" });
    const { accessToken } = await getTokenWithClaim("avanzado");
    const cliente = clienteConToken(accessToken);

    await withPolicyDisabled(admin, "public", "agentes", "agentes_select_por_nivel", async () => {
      const { data, error } = await cliente.from("agentes").select().eq("id", agente.id);
      expect(error).toBeNull();
      // Con la policy activa, el test hermano de arriba espera 1 fila.
      expect(data).toHaveLength(0);
    });
  });
});
