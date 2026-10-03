// VGRP-62 — integración real (contra el proyecto de Supabase) de la capa de
// datos de cuentas de cobro: alta, edición, activación y la lectura que usa
// /comprar. Requiere aplicada la migración 20261003180000_activar_cuenta_cobro.
//
// SEGURIDAD DE ESTE ARCHIVO: no hay base de test separada, y activar una cuenta
// DESACTIVA la que esté activa. Si hay una cuenta activa REAL (no "[test]"), los
// tests que activan se saltean: nunca se la desplaza, ni siquiera un instante.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthenticatedUser } from "../../../test/helpers/auth";
import { cleanupUser } from "../../../test/helpers/cleanup";
import {
  CUENTA_COBRO_TEST,
  hayCuentaActivaReal,
  limpiarCuentasDeTest,
} from "../../../test/helpers/cuenta-cobro-seed";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import { consultarCuentaActiva } from "../cuenta-cobro";
import { conAuditoria } from "./audit-log";
import {
  activarCuenta,
  actualizarCuenta,
  CuentaNoEncontrada,
  crearCuenta,
  listarCuentas,
  obtenerCuenta,
} from "./cuentas";

const admin = createTestAdminClient();

/** Valores válidos de alta; el titular lleva el marcador para que se pueda limpiar. */
function valores(sufijo: string) {
  return { ...CUENTA_COBRO_TEST, titular: `${CUENTA_COBRO_TEST.titular} ${sufijo}` };
}

async function cantidadDeActivasDeTest(): Promise<number> {
  const { count, error } = await admin
    .from("cuentas_cobro")
    .select("*", { count: "exact", head: true })
    .eq("activa", true)
    .like("titular", "[test]%");
  if (error) throw error;
  return count ?? 0;
}

describe("cuentas de cobro — capa de datos (integración real)", () => {
  let hayActivaReal = false;
  let actorId: string | null = null;

  beforeAll(async () => {
    hayActivaReal = await hayCuentaActivaReal(admin);
  });

  afterEach(async () => {
    await limpiarCuentasDeTest(admin);
    if (actorId) await cleanupUser(actorId);
    actorId = null;
  });

  it("crearCuenta: guarda la forma canónica y la deja INACTIVA", async () => {
    const { resultado, valorAnterior, valorNuevo, entidadId } = await crearCuenta(admin, {
      ...valores("alta"),
      cuit: "20-12345678-6",
      cbu_cvu: "0000 0000 0000 0000 0000 01",
    });

    expect(resultado.activa).toBe(false);
    expect(resultado.cuit).toBe("20123456786");
    expect(resultado.cbu_cvu).toBe("0000000000000000000001");
    expect(valorAnterior).toBeNull();
    expect(valorNuevo).toMatchObject({ id: resultado.id });
    expect(entidadId).toBe(resultado.id);
  });

  it("crearCuenta con datos inválidos no inserta nada", async () => {
    await expect(crearCuenta(admin, { ...valores("mala"), cuit: "20123456787" })).rejects.toThrow();

    const { count } = await admin
      .from("cuentas_cobro")
      .select("*", { count: "exact", head: true })
      .like("titular", "%mala");
    expect(count).toBe(0);
  });

  it("actualizarCuenta: cambia sólo lo enviado, devuelve anterior/nuevo y NO toca `activa`", async () => {
    const { resultado: creada } = await crearCuenta(admin, valores("edicion"));

    const out = await actualizarCuenta(admin, creada.id, { alias: "nuevo.alias.ok", activa: true });

    expect(out.resultado.alias).toBe("nuevo.alias.ok");
    expect(out.resultado.banco).toBe(creada.banco);
    expect(out.resultado.activa).toBe(false);
    expect(out.valorAnterior).toMatchObject({ alias: creada.alias });
    expect(out.valorNuevo).toMatchObject({ alias: "nuevo.alias.ok" });
    expect(out.resultado.updated_at >= creada.updated_at).toBe(true);
  });

  it("actualizarCuenta de un id inexistente tira CuentaNoEncontrada", async () => {
    await expect(
      actualizarCuenta(admin, "00000000-0000-4000-8000-000000000000", { alias: "abcdef" }),
    ).rejects.toBeInstanceOf(CuentaNoEncontrada);
  });

  it("obtenerCuenta devuelve null si no existe", async () => {
    expect(await obtenerCuenta(admin, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("activarCuenta de un id inexistente tira CuentaNoEncontrada", async (ctx) => {
    if (hayActivaReal) return ctx.skip();
    await expect(
      activarCuenta(admin, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(CuentaNoEncontrada);
  });

  it("activar una cuenta la deja como la única activa; activar otra mueve la activa", async (ctx) => {
    if (hayActivaReal) return ctx.skip();
    const { resultado: a } = await crearCuenta(admin, valores("A"));
    const { resultado: b } = await crearCuenta(admin, valores("B"));

    const primera = await activarCuenta(admin, a.id);
    expect(primera.resultado.activa).toBe(true);
    expect(primera.valorAnterior).toBeNull();
    expect(await cantidadDeActivasDeTest()).toBe(1);

    const segunda = await activarCuenta(admin, b.id);
    expect(segunda.resultado.id).toBe(b.id);
    expect(segunda.valorAnterior).toMatchObject({ id: a.id, activa: true });
    expect(segunda.valorNuevo).toMatchObject({ id: b.id, activa: true });
    expect(await cantidadDeActivasDeTest()).toBe(1);

    expect((await obtenerCuenta(admin, a.id))?.activa).toBe(false);
    expect((await obtenerCuenta(admin, b.id))?.activa).toBe(true);
  });

  it("activar la que ya está activa es idempotente", async (ctx) => {
    if (hayActivaReal) return ctx.skip();
    const { resultado } = await crearCuenta(admin, valores("idem"));

    await activarCuenta(admin, resultado.id);
    const otra = await activarCuenta(admin, resultado.id);

    expect(otra.resultado.activa).toBe(true);
    expect(await cantidadDeActivasDeTest()).toBe(1);
  });

  it("dos activaciones simultáneas de cuentas distintas dejan exactamente una activa y ningún error", async (ctx) => {
    if (hayActivaReal) return ctx.skip();
    const { resultado: a } = await crearCuenta(admin, valores("carrera-A"));
    const { resultado: b } = await crearCuenta(admin, valores("carrera-B"));

    const resultados = await Promise.allSettled([
      activarCuenta(admin, a.id),
      activarCuenta(admin, b.id),
    ]);

    expect(resultados.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await cantidadDeActivasDeTest()).toBe(1);
  });

  it("listarCuentas pone la activa primero", async (ctx) => {
    if (hayActivaReal) return ctx.skip();
    const { resultado: a } = await crearCuenta(admin, valores("lista-A"));
    await crearCuenta(admin, valores("lista-B"));
    await activarCuenta(admin, a.id);

    const lista = await listarCuentas(admin);

    expect(lista[0]?.id).toBe(a.id);
    expect(lista[0]?.activa).toBe(true);
  });

  describe("consultarCuentaActiva (lo que lee /comprar)", () => {
    it("devuelve null cuando no hay ninguna activa", async (ctx) => {
      if (hayActivaReal) return ctx.skip();
      await crearCuenta(admin, valores("inactiva"));

      expect(await consultarCuentaActiva(admin)).toBeNull();
    });

    it("devuelve la activa con exactamente los campos de CuentaCobroVisible", async (ctx) => {
      if (hayActivaReal) return ctx.skip();
      const { resultado } = await crearCuenta(admin, valores("visible"));
      await activarCuenta(admin, resultado.id);

      const visible = await consultarCuentaActiva(admin);

      expect(visible).toEqual({
        id: resultado.id,
        titular: resultado.titular,
        cuit: "20123456786",
        banco: "Banco de prueba",
        cbuCvu: "0000000000000000000001",
        alias: "og.circle.prueba",
        notas: "Cuenta de prueba: NO transferir dinero.",
      });
      // Nada de columnas internas.
      expect(Object.keys(visible ?? {}).sort()).toEqual(
        ["alias", "banco", "cbuCvu", "cuit", "id", "notas", "titular"].sort(),
      );
    });
  });

  describe("auditoría (con conAuditoria real)", () => {
    it("activar deja su fila en admin_audit_log con la cuenta anterior y la nueva", async (ctx) => {
      if (hayActivaReal) return ctx.skip();
      const actor = await createAuthenticatedUser("ninguno");
      actorId = actor.userId;
      const { resultado: a } = await crearCuenta(admin, valores("audit-A"));
      const { resultado: b } = await crearCuenta(admin, valores("audit-B"));
      await activarCuenta(admin, a.id);

      await conAuditoria(
        admin,
        {
          actorId: actor.userId,
          accion: "activar_cuenta_cobro",
          entidad: "cuentas_cobro",
          entidadId: b.id,
        },
        () => activarCuenta(admin, b.id),
      );

      const { data } = await admin
        .from("admin_audit_log")
        .select("accion, entidad, entidad_id, valor_anterior, valor_nuevo")
        .eq("actor_id", actor.userId);
      expect(data).toHaveLength(1);
      expect(data?.[0]).toMatchObject({
        accion: "activar_cuenta_cobro",
        entidad: "cuentas_cobro",
        entidad_id: b.id,
        valor_anterior: { id: a.id, activa: true },
        valor_nuevo: { id: b.id, activa: true },
      });
    });
  });
});
