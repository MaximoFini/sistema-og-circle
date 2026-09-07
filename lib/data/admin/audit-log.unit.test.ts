// VGRP-47 §3 — tests unitarios (mockeados, sin Postgres real) de
// `conAuditoria()`. Complementa a `audit-log.test.ts` (integración contra el
// proyecto real de Supabase — NO TOCAR ese archivo, es de otro proceso en
// paralelo). Este archivo cubre específicamente el hueco de auditoría: qué
// pasa cuando el insert de `admin_audit_log` falla DESPUÉS de una mutación
// exitosa, que hoy no tenía ningún test.
//
// Se mockea `@sentry/nextjs` (spy en `captureException`) y se arma un cliente
// Supabase falso mínimo — sólo lo que `registrarAccionAdmin` toca
// (`admin.from("admin_audit_log").insert(...)`) — no hace falta el cliente
// real de Supabase para nada de esto.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCaptureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

import { type AuditoriaMeta, conAuditoria, type ResultadoMutacion } from "./audit-log";

/** Cliente Supabase falso mínimo: sólo implementa `.from("admin_audit_log").insert(...)`,
 *  que es lo único que `registrarAccionAdmin` usa. `insertResult` controla si
 *  ese insert "falla" (devuelve `{ error }`) o tiene éxito (`{ error: null }`). */
function fakeAdminClient(insertResult: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as Parameters<typeof conAuditoria>[0], from, insert };
}

const META: AuditoriaMeta = {
  actorId: "admin-1",
  accion: "cambiar_nivel",
  entidad: "profiles",
  entidadId: "user-1",
};

describe("conAuditoria", () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
  });

  it("mutacion() tira -> propaga la excepción tal cual y NUNCA llama a admin.from (insert de auditoría)", async () => {
    const boom = new Error("la mutación falló");
    const { client, from } = fakeAdminClient({ error: null });
    const mutacion = vi.fn<() => Promise<ResultadoMutacion<unknown>>>().mockRejectedValue(boom);

    await expect(conAuditoria(client, META, mutacion)).rejects.toBe(boom);

    expect(from).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("mutacion() OK pero el insert de auditoría falla -> NO lanza, devuelve resultado igual, y reporta a Sentry con tags admin-audit-gap", async () => {
    const errorInsert = { message: "insert falló", code: "23505" };
    const { client, insert } = fakeAdminClient({ error: errorInsert });
    const resultado = { nivelAnterior: "ninguno", nivelNuevo: "avanzado" };
    const mutacion = vi.fn<() => Promise<ResultadoMutacion<typeof resultado>>>().mockResolvedValue({
      resultado,
      valorAnterior: { nivel: "ninguno" },
      valorNuevo: { nivel: "avanzado" },
    });

    // No revierte nada (no hay nada que revertir) y NO le devuelve el error al
    // caller: la mutación de negocio ya ocurrió.
    const out = await conAuditoria(client, META, mutacion);

    expect(out).toEqual(resultado);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    const [erroreReportado, opciones] = mockCaptureException.mock.calls[0];
    expect(erroreReportado).toEqual(errorInsert);
    expect(opciones).toMatchObject({ tags: { "admin-audit-gap": "true" } });
  });

  it("happy path: mutación exitosa + insert exitoso -> devuelve resultado y llama a admin.from('admin_audit_log').insert(...) con los campos correctos", async () => {
    const { client, from, insert } = fakeAdminClient({ error: null });
    const resultado = { nivelAnterior: "ninguno", nivelNuevo: "principiante" };
    const mutacion = vi.fn<() => Promise<ResultadoMutacion<typeof resultado>>>().mockResolvedValue({
      resultado,
      valorAnterior: { nivel: "ninguno" },
      valorNuevo: { nivel: "principiante", motivo: "transferencia" },
    });

    const out = await conAuditoria(client, META, mutacion);

    expect(out).toEqual(resultado);
    expect(from).toHaveBeenCalledWith("admin_audit_log");
    expect(insert).toHaveBeenCalledWith({
      actor_id: META.actorId,
      accion: META.accion,
      entidad: META.entidad,
      entidad_id: META.entidadId,
      valor_anterior: { nivel: "ninguno" },
      valor_nuevo: { nivel: "principiante", motivo: "transferencia" },
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
