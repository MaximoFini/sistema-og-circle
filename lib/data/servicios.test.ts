// VGRP-32 — tests de integración de lib/data/servicios.ts contra el proyecto real de
// Supabase (mismo criterio que lib/data/agentes.test.ts).
//
// VGRP-59/60 (Bloque 13 — plan único): `nivel_requerido` dejó de existir en la tabla
// `servicios_financieros` — el gating ahora es binario (con acceso / sin acceso), vía
// `tieneAcceso()`.

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../test/helpers/db-client";
import type { AppMetadataClaims } from "../auth/claims";
import { obtenerServiciosFinancieros } from "./servicios";

const admin = createTestAdminClient();

const idsCreados: string[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const id = idsCreados.pop() as string;
    await admin.from("servicios_financieros").delete().eq("id", id);
  }
});

function claimsConNivel(nivel: string): AppMetadataClaims {
  return { app_metadata: { nivel } };
}

async function crearServicioTest(valores: {
  titulo: string;
  descripcion?: string;
  activo?: boolean;
}) {
  const { data, error } = await admin
    .from("servicios_financieros")
    .insert({
      titulo: valores.titulo,
      descripcion: valores.descripcion ?? "descripcion-secreta-de-test",
      activo: valores.activo ?? true,
      orden: 0,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("obtenerServiciosFinancieros", () => {
  it("expone la descripción cuando el claim tiene el plan completo", async () => {
    const servicio = await crearServicioTest({ titulo: "Test con acceso" });

    const items = await obtenerServiciosFinancieros(admin, claimsConNivel("completo"));
    const item = items.find((i) => i.id === servicio.id);

    expect(item?.descripcion).toBe("descripcion-secreta-de-test");
  });

  it("US-2 — el título SIEMPRE se ve, aunque la descripción (con datos SWIFT) esté bloqueada", async () => {
    const servicio = await crearServicioTest({
      titulo: "Pagos vía SWIFT",
      descripcion: "IBAN-secreto-no-debe-salir",
    });

    const items = await obtenerServiciosFinancieros(admin, claimsConNivel("ninguno"));
    const item = items.find((i) => i.id === servicio.id);

    expect(item).toBeDefined();
    expect(item?.publicMeta.titulo).toBe("Pagos vía SWIFT");
    expect(item?.descripcion).toBeNull();
    expect(JSON.stringify(item)).not.toContain("IBAN-secreto-no-debe-salir");
  });

  it("sin sesión (claims null) nunca expone la descripción", async () => {
    const servicio = await crearServicioTest({ titulo: "Test sin sesión" });

    const items = await obtenerServiciosFinancieros(admin, null);
    const item = items.find((i) => i.id === servicio.id);

    expect(item?.descripcion).toBeNull();
  });

  it("excluye filas activo=false", async () => {
    const servicio = await crearServicioTest({ titulo: "Test inactivo", activo: false });

    const items = await obtenerServiciosFinancieros(admin, claimsConNivel("completo"));

    expect(items.some((i) => i.id === servicio.id)).toBe(false);
  });
});
