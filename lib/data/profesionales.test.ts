// VGRP-32 — tests de integración de lib/data/profesionales.ts contra el proyecto real
// de Supabase (mismo criterio que lib/data/agentes.test.ts).

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../test/helpers/db-client";
import { obtenerProfesionales } from "./profesionales";

const admin = createTestAdminClient();

const idsCreados: string[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const id = idsCreados.pop() as string;
    await admin.from("profesionales").delete().eq("id", id);
  }
});

async function crearProfesionalTest(valores: {
  nombre: string;
  contacto?: string | null;
  activo?: boolean;
}) {
  const { data, error } = await admin
    .from("profesionales")
    .insert({
      nombre: valores.nombre,
      rubro: "Test",
      descripcion: null,
      contacto: valores.contacto ?? "contacto-de-test",
      activo: valores.activo ?? true,
      orden: 0,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("obtenerProfesionales", () => {
  // VGRP-77 — antes alcanzaba con tener sesión; ahora el contacto es del plan completo.
  it("expone el contacto con el plan completo", async () => {
    const prof = await crearProfesionalTest({ nombre: "Test con plan" });

    const items = await obtenerProfesionales(admin, { app_metadata: { nivel: "completo" } });
    const item = items.find((i) => i.id === prof.id);

    expect(item?.contacto).toBe("contacto-de-test");
  });

  it("con sesión pero sin plan ('ninguno'): nombre y rubro sí, contacto no", async () => {
    const prof = await crearProfesionalTest({ nombre: "Test sin plan" });

    const items = await obtenerProfesionales(admin, { app_metadata: { nivel: "ninguno" } });
    const item = items.find((i) => i.id === prof.id);

    expect(item?.publicMeta.nombre).toBe("Test sin plan");
    expect(item?.contacto).toBeNull();
  });

  it("nunca expone el contacto sin sesión (claims null)", async () => {
    const prof = await crearProfesionalTest({ nombre: "Test sin sesión" });

    const items = await obtenerProfesionales(admin, null);
    const item = items.find((i) => i.id === prof.id);

    expect(item).toBeDefined();
    expect(item?.contacto).toBeNull();
  });

  it("fotoUrl: null sin foto, URL pública con foto — aun sin plan", async () => {
    const sinFoto = await crearProfesionalTest({ nombre: "Test sin foto" });
    const conFoto = await crearProfesionalTest({ nombre: "Test con foto" });
    const path = `profesionales/${conFoto.id}/foto.webp`;
    await admin.from("profesionales").update({ foto_path: path }).eq("id", conFoto.id);

    const items = await obtenerProfesionales(admin, { app_metadata: { nivel: "ninguno" } });

    expect(items.find((i) => i.id === sinFoto.id)?.publicMeta.fotoUrl).toBeNull();
    const item = items.find((i) => i.id === conFoto.id);
    expect(item?.publicMeta.fotoUrl).toMatch(
      new RegExp(`/storage/v1/object/public/fotos-directorio/${path}$`),
    );
    expect(item?.contacto).toBeNull();
  });

  it("excluye filas activo=false", async () => {
    const prof = await crearProfesionalTest({ nombre: "Test inactivo", activo: false });

    const items = await obtenerProfesionales(admin, { app_metadata: { nivel: "avanzado" } });

    expect(items.some((i) => i.id === prof.id)).toBe(false);
  });
});
