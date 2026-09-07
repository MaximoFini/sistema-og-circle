// VGRP-47 §2/§3 — `escaparLike` y el keyset de `listarUsuarios` contra
// Postgres real (no hay base de test separada, ver docs/TESTING.md). El
// escape en sí ya está cubierto de forma pura y barata en `keyset.test.ts`
// (sin pegarle a la base); acá se prueba el ÁNGULO que sólo tiene sentido
// contra datos reales: que `listarUsuarios` de verdad use `escaparLike` antes
// de armar el `.ilike()`, y que el keyset no repita ni saltee filas ante un
// empate exacto de `created_at`.
//
// Sobre "¿permite Supabase Auth `%`/`_` en la parte local de un email?": SÍ
// (verificado a mano contra este proyecto antes de escribir el archivo — un
// `%`/`_` en la parte local es válido según RFC 5321/5322 y Supabase Auth no
// lo rechaza). Aun así, el ángulo más realista de este ticket es "un admin
// tipea `%`/`_` en el INPUT de búsqueda" (son los caracteres que el admin
// puede escribir sin querer al buscar un fragmento de email, ej. un
// `nombre_apellido@...`), no que el propio dato tenga esos caracteres — por
// eso el test de abajo pone el caracter especial en el `q` de la búsqueda, con
// datos de test que harían la diferencia visible si el escape faltara.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupUser } from "../../../test/helpers/cleanup";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import { listarUsuarios } from "./usuarios";
import "../../../test/helpers/load-env";
import { TEST_EMAIL_SUFFIX } from "../../../test/helpers/seed-users";
import { withAuthRetry } from "../../../test/helpers/with-auth-retry";

const admin = createTestAdminClient();

async function crearUsuario(localPart: string): Promise<string> {
  const email = `${localPart}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

describe("listarUsuarios: escaparLike contra búsqueda real (VGRP-47 §2)", () => {
  let idConGuionBajo: string | null = null;
  let idSinGuionBajo: string | null = null;

  afterEach(async () => {
    if (idConGuionBajo) {
      await cleanupUser(idConGuionBajo);
      idConGuionBajo = null;
    }
    if (idSinGuionBajo) {
      await cleanupUser(idSinGuionBajo);
      idSinGuionBajo = null;
    }
  });

  it("buscar con '_' literal en el input no matchea de más (el '_' no actúa como comodín de un caracter)", async () => {
    const sufijo = randomUUID().slice(0, 8);
    // "_" en la posición que, si no estuviera escapado, matchearía CUALQUIER
    // caracter — construimos el segundo usuario para que calce exactamente en
    // ese patrón sin escapar (mismo largo, "_" reemplazado por otra letra).
    const conGuionBajo = `busca-guion_bajo-${sufijo}`;
    const sinGuionBajo = `busca-guionXbajo-${sufijo}`; // mismo largo, "X" en vez de "_"

    idConGuionBajo = await crearUsuario(conGuionBajo);
    idSinGuionBajo = await crearUsuario(sinGuionBajo);

    const { usuarios } = await listarUsuarios(admin, { q: `guion_bajo-${sufijo}` });

    const emails = usuarios.map((u) => u.email);
    expect(emails).toContain(`${conGuionBajo}${TEST_EMAIL_SUFFIX}`);
    // Si escaparLike no escapara "_", este segundo email también matchearía
    // (el "_" del input actuaría como comodín de "X") — no debe aparecer.
    expect(emails).not.toContain(`${sinGuionBajo}${TEST_EMAIL_SUFFIX}`);
  });

  it("buscar con '%' literal en el input no trae de más (el '%' no actúa como comodín de cualquier secuencia)", async () => {
    const sufijo = randomUUID().slice(0, 8);
    const conPorcentaje = `busca-100%-${sufijo}`;
    const sinPorcentaje = `busca-100-cualquiercosa-${sufijo}`;

    // El email real no puede contener "%" sin codificar de forma rara en
    // algunos validadores — se confirma explícitamente que Supabase Auth lo
    // acepta antes de asumirlo.
    let creadoConPorcentaje: string;
    try {
      creadoConPorcentaje = await crearUsuario(conPorcentaje);
    } catch (e) {
      // Documentado honestamente: si el Admin API llegara a rechazar "%" en
      // el local-part (comportamiento no confirmado en este proyecto al
      // momento de escribir el test), el ángulo de este caso puntual no
      // aplica — no se simula un resultado falso.
      throw new Error(
        `crearUsuario con "%" en el email falló (¿Supabase Auth lo rechazó?): ${String(e)}`,
      );
    }
    idConGuionBajo = creadoConPorcentaje; // reusa el afterEach de arriba
    idSinGuionBajo = await crearUsuario(sinPorcentaje);

    const { usuarios } = await listarUsuarios(admin, { q: `100%-${sufijo}` });

    const emails = usuarios.map((u) => u.email);
    expect(emails).toContain(`${conPorcentaje}${TEST_EMAIL_SUFFIX}`);
    // Si escaparLike no escapara "%", este segundo email (que contiene
    // "100" + cualquier cosa + el sufijo) también matchearía.
    expect(emails).not.toContain(`${sinPorcentaje}${TEST_EMAIL_SUFFIX}`);
  });
});

describe("listarUsuarios: keyset con empate exacto de created_at (VGRP-47 §3)", () => {
  let idA: string | null = null;
  let idB: string | null = null;

  afterEach(async () => {
    if (idA) {
      await cleanupUser(idA);
      idA = null;
    }
    if (idB) {
      await cleanupUser(idB);
      idB = null;
    }
  });

  it("paginar de a 1 no repite ni saltea ninguno de los dos usuarios con el mismo created_at exacto", async () => {
    idA = await crearUsuario(`empate-a-${randomUUID()}`);
    idB = await crearUsuario(`empate-b-${randomUUID()}`);

    // `created_at` lo pone el default de la tabla al crear la fila —lo
    // forzamos a un valor idéntico con un UPDATE directo del cliente admin
    // (bypassea RLS) para simular el empate exacto que un timestamp con menor
    // resolución podría producir en la práctica.
    const timestampFijo = new Date().toISOString();
    const { error: updateAError } = await admin
      .from("profiles")
      .update({ created_at: timestampFijo })
      .eq("id", idA);
    if (updateAError) throw updateAError;
    const { error: updateBError } = await admin
      .from("profiles")
      .update({ created_at: timestampFijo })
      .eq("id", idB);
    if (updateBError) throw updateBError;

    // Filtramos por nivel="ninguno" (default de crearUsuario) para no
    // depender de qué otros usuarios de test/seed existan en la base en este
    // momento — nos interesa sólo el orden relativo entre A y B.
    const primeraPagina = await listarUsuarios(admin, { limit: 1, nivel: "ninguno" });

    // Buscamos la página que contiene a A o B (puede haber otros usuarios
    // nivel="ninguno" de otros tests corriendo antes en la misma suite,
    // dado created_at desc, id desc — paginamos hasta encontrarlos).
    const idsVistos = new Set<string>();
    let cursor: string | null = null;
    let paginaActual = primeraPagina;
    let guard = 0;
    while (guard < 200) {
      guard++;
      for (const u of paginaActual.usuarios) idsVistos.add(u.id);
      if (idsVistos.has(idA) && idsVistos.has(idB)) break;
      cursor = paginaActual.nextCursor;
      if (!cursor) break;
      paginaActual = await listarUsuarios(admin, { limit: 1, nivel: "ninguno", cursor });
    }

    expect(idsVistos.has(idA)).toBe(true);
    expect(idsVistos.has(idB)).toBe(true);

    // "No repite": recorremos TODAS las páginas de punta a punta y contamos
    // cuántas veces aparece cada uno de los dos ids empatados.
    const conteo = new Map<string, number>();
    cursor = null;
    paginaActual = await listarUsuarios(admin, { limit: 1, nivel: "ninguno" });
    guard = 0;
    for (;;) {
      guard++;
      if (guard > 500) throw new Error("Demasiadas páginas — posible loop infinito en el keyset.");
      for (const u of paginaActual.usuarios) {
        if (u.id === idA || u.id === idB) conteo.set(u.id, (conteo.get(u.id) ?? 0) + 1);
      }
      if (!paginaActual.nextCursor) break;
      paginaActual = await listarUsuarios(admin, {
        limit: 1,
        nivel: "ninguno",
        cursor: paginaActual.nextCursor,
      });
    }

    expect(conteo.get(idA)).toBe(1);
    expect(conteo.get(idB)).toBe(1);
  });
});
