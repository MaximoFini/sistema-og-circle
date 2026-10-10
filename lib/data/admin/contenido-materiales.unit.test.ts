// VGRP-88 — materiales en la capa de contenido, sin base ni Storage reales: la lista blanca,
// el alta (verifica y mueve el archivo, deriva tipo/tamaño en el servidor), el reemplazo
// (el archivo viejo se borra DESPUÉS del update), el borrado y la limpieza cuando algo falla.
// Contra Supabase real: contenido.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES } from "../../materiales/tipos";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const PENDIENTE = `pendientes/${UUID}.pdf`;
const ARCHIVO_NUEVO = "archivos/nuevo-uuid.pdf";

/** Bitácora compartida entre el cliente falso y Storage, para verificar el ORDEN de las
 *  operaciones (ej.: el archivo viejo se borra después del update, no antes). */
const bitacora: string[] = [];

const storage = vi.hoisted(() => ({
  verificarObjeto: vi.fn(),
  moverAArchivos: vi.fn(),
  borrarObjeto: vi.fn(),
}));
vi.mock("../../materiales/storage", () => storage);

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));

const {
  actualizarContenido,
  ArchivoInvalido,
  borrarContenido,
  campoVigencia,
  crearContenido,
  ENTIDADES,
  esEntidadValida,
  ItemNoEncontrado,
  TAG_POR_ENTIDAD,
} = await import("./contenido");

type Fila = Record<string, unknown>;

interface Config {
  anterior?: Fila | null;
  ultimoOrden?: number | null;
  falloInsert?: Error;
  falloUpdate?: Error;
}

/** Cliente Supabase mínimo para la tabla `materiales`: registra los datos que se escriben. */
function fakeAdmin(cfg: Config = {}) {
  const escrituras: { op: string; datos?: Fila }[] = [];
  const from = () => {
    let op = "select";
    let datos: Fila | undefined;
    let columnas = "";
    // biome-ignore lint/suspicious/noExplicitAny: builder encadenable de prueba
    const b: any = {
      select: (c?: string) => {
        columnas = c ?? "";
        return b;
      },
      order: () => b,
      limit: () => b,
      eq: () => b,
      insert: (d: Fila) => {
        op = "insert";
        datos = d;
        escrituras.push({ op, datos });
        return b;
      },
      update: (d: Fila) => {
        op = "update";
        datos = d;
        escrituras.push({ op, datos });
        return b;
      },
      delete: () => {
        op = "delete";
        escrituras.push({ op });
        return b;
      },
      maybeSingle: async () => {
        if (columnas === "orden") {
          return {
            data: cfg.ultimoOrden == null ? null : { orden: cfg.ultimoOrden },
            error: null,
          };
        }
        return { data: cfg.anterior ?? null, error: null };
      },
      single: async () => {
        bitacora.push(op);
        if (op === "insert") {
          return {
            data: cfg.falloInsert ? null : { id: "nuevo-id", ...datos },
            error: cfg.falloInsert ?? null,
          };
        }
        return {
          data: cfg.falloUpdate ? null : { ...cfg.anterior, ...datos },
          error: cfg.falloUpdate ?? null,
        };
      },
      // `await ....delete().eq(...)` sin terminal.
      // biome-ignore lint/suspicious/noThenProperty: simula el thenable de supabase-js
      then: (resolve: (v: unknown) => void) => {
        bitacora.push(op);
        resolve({ error: null });
      },
    };
    return b;
  };
  return { admin: { from } as unknown as Parameters<typeof crearContenido>[0], escrituras };
}

const ANTERIOR: Fila = {
  id: "m1",
  titulo: "Guía",
  descripcion: "d",
  storage_path: "archivos/viejo.pdf",
  tipo: "pdf",
  extension: "pdf",
  tamano_bytes: 1000,
  orden: 4,
  publicado: true,
};

beforeEach(() => {
  bitacora.length = 0;
  captureException.mockReset();
  for (const fn of Object.values(storage)) fn.mockReset();
  storage.verificarObjeto.mockResolvedValue({ tamanoBytes: 2_400_000, mime: "application/pdf" });
  storage.moverAArchivos.mockResolvedValue(ARCHIVO_NUEVO);
  storage.borrarObjeto.mockImplementation(async (path: string) => {
    bitacora.push(`borrar:${path}`);
  });
});

describe("materiales en la lista blanca", () => {
  it("es una entidad válida y tiene su tag de revalidación", () => {
    expect(ENTIDADES).toContain("materiales");
    expect(esEntidadValida("materiales")).toBe(true);
    expect(TAG_POR_ENTIDAD.materiales).toBe("grilla-materiales");
  });

  it("su campo de vigencia es `publicado`, como videos", () => {
    expect(campoVigencia("materiales")).toBe("publicado");
    expect(campoVigencia("videos")).toBe("publicado");
    expect(campoVigencia("agentes")).toBe("activo");
  });

  it("cada entidad tiene un tag propio", () => {
    const tags = Object.values(TAG_POR_ENTIDAD);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("crearContenido('materiales')", () => {
  it("sin archivo pendiente: ArchivoInvalido y no toca Storage", async () => {
    const { admin } = fakeAdmin();

    await expect(crearContenido(admin, "materiales", { titulo: "Guía" })).rejects.toBeInstanceOf(
      ArchivoInvalido,
    );
    expect(storage.verificarObjeto).not.toHaveBeenCalled();
  });

  it("rechaza un path que no sea pendientes/<uuid>.<ext> (no se puede apuntar a otro archivo)", async () => {
    const { admin } = fakeAdmin();

    for (const malo of [
      `archivos/${UUID}.pdf`,
      `pendientes/../archivos/${UUID}.pdf`,
      `pendientes/${UUID}.exe`,
    ]) {
      await expect(
        crearContenido(admin, "materiales", { titulo: "Guía", storage_path_pendiente: malo }),
      ).rejects.toThrow();
    }
    expect(storage.moverAArchivos).not.toHaveBeenCalled();
  });

  it("un objeto que no existe en Storage da ArchivoInvalido", async () => {
    storage.verificarObjeto.mockResolvedValue(null);
    const { admin } = fakeAdmin();

    await expect(
      crearContenido(admin, "materiales", { titulo: "Guía", storage_path_pendiente: PENDIENTE }),
    ).rejects.toThrow(/No encontramos el archivo/);
    expect(storage.moverAArchivos).not.toHaveBeenCalled();
  });

  it("más de 50 MB REALES se rechaza (aunque el cliente haya dicho otra cosa) y se borra el objeto", async () => {
    storage.verificarObjeto.mockResolvedValue({
      tamanoBytes: MAX_BYTES + 1,
      mime: "application/pdf",
    });
    const { admin, escrituras } = fakeAdmin();

    await expect(
      crearContenido(admin, "materiales", { titulo: "Guía", storage_path_pendiente: PENDIENTE }),
    ).rejects.toThrow(/supera el máximo de 50 MB/);
    expect(storage.borrarObjeto).toHaveBeenCalledWith(PENDIENTE);
    expect(storage.moverAArchivos).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });

  it("un archivo vacío se rechaza", async () => {
    storage.verificarObjeto.mockResolvedValue({ tamanoBytes: 0, mime: "application/pdf" });
    const { admin } = fakeAdmin();

    await expect(
      crearContenido(admin, "materiales", { titulo: "Guía", storage_path_pendiente: PENDIENTE }),
    ).rejects.toThrow(/vacío/);
  });

  it("ok: mueve el archivo y deriva tipo, extensión y tamaño del servidor, no del body", async () => {
    const { admin, escrituras } = fakeAdmin({ ultimoOrden: 6 });

    const out = await crearContenido(admin, "materiales", {
      titulo: "  Checklist  ",
      descripcion: "Para el primer envío",
      storage_path_pendiente: PENDIENTE,
      // Nada de esto se acepta del request:
      tipo: "excel",
      extension: "xlsx",
      tamano_bytes: 1,
      storage_path: "archivos/ajeno.pdf",
    });

    expect(storage.moverAArchivos).toHaveBeenCalledWith(PENDIENTE);
    expect(escrituras[0]?.datos).toEqual({
      titulo: "Checklist",
      descripcion: "Para el primer envío",
      orden: 7, // al final
      storage_path: ARCHIVO_NUEVO,
      tipo: "pdf",
      extension: "pdf",
      tamano_bytes: 2_400_000,
    });
    expect(out.entidadId).toBe("nuevo-id");
    expect(out.valorAnterior).toBeNull();
  });

  it("un `orden` explícito se respeta", async () => {
    const { admin, escrituras } = fakeAdmin({ ultimoOrden: 6 });

    await crearContenido(admin, "materiales", {
      titulo: "Guía",
      orden: 0,
      storage_path_pendiente: PENDIENTE,
    });

    expect(escrituras[0]?.datos?.orden).toBe(0);
  });

  it("primer material: queda en orden 0", async () => {
    const { admin, escrituras } = fakeAdmin({ ultimoOrden: null });

    await crearContenido(admin, "materiales", {
      titulo: "Guía",
      storage_path_pendiente: PENDIENTE,
    });

    expect(escrituras[0]?.datos?.orden).toBe(0);
  });

  it("si falla el insert, el archivo ya movido no queda suelto", async () => {
    const { admin } = fakeAdmin({ falloInsert: new Error("insert falló") });

    await expect(
      crearContenido(admin, "materiales", { titulo: "Guía", storage_path_pendiente: PENDIENTE }),
    ).rejects.toThrow("insert falló");
    expect(storage.borrarObjeto).toHaveBeenCalledWith(ARCHIVO_NUEVO);
  });
});

describe("actualizarContenido('materiales')", () => {
  it("un id inexistente da ItemNoEncontrado y no toca Storage", async () => {
    const { admin } = fakeAdmin({ anterior: null });

    await expect(
      actualizarContenido(admin, "materiales", "no-existe", { titulo: "x" }),
    ).rejects.toBeInstanceOf(ItemNoEncontrado);
    expect(storage.verificarObjeto).not.toHaveBeenCalled();
  });

  it("editar texto no toca el archivo", async () => {
    const { admin, escrituras } = fakeAdmin({ anterior: ANTERIOR });

    await actualizarContenido(admin, "materiales", "m1", {
      titulo: "Nuevo título",
      publicado: false,
    });

    expect(escrituras[0]?.datos).toMatchObject({ titulo: "Nuevo título", publicado: false });
    expect(escrituras[0]?.datos).not.toHaveProperty("storage_path");
    expect(storage.verificarObjeto).not.toHaveBeenCalled();
    expect(storage.borrarObjeto).not.toHaveBeenCalled();
  });

  it("reemplazar el archivo: actualiza tipo, extensión y tamaño y conserva el resto", async () => {
    storage.verificarObjeto.mockResolvedValue({ tamanoBytes: 900, mime: "application/pdf" });
    const { admin, escrituras } = fakeAdmin({ anterior: ANTERIOR });

    const out = await actualizarContenido(admin, "materiales", "m1", {
      storage_path_pendiente: `pendientes/${UUID}.docx`,
    });

    const datos = escrituras[0]?.datos ?? {};
    expect(datos).toMatchObject({
      storage_path: ARCHIVO_NUEVO,
      tipo: "word",
      extension: "docx",
      tamano_bytes: 900,
    });
    // Título, descripción, orden y publicado NO se tocan: no vienen en el update.
    for (const campo of ["titulo", "descripcion", "orden", "publicado"]) {
      expect(datos).not.toHaveProperty(campo);
    }
    expect((out.valorAnterior as Fila).storage_path).toBe("archivos/viejo.pdf");
  });

  it("el archivo viejo se borra DESPUÉS del update, nunca antes", async () => {
    const { admin } = fakeAdmin({ anterior: ANTERIOR });

    await actualizarContenido(admin, "materiales", "m1", { storage_path_pendiente: PENDIENTE });

    expect(bitacora).toEqual(["update", "borrar:archivos/viejo.pdf"]);
  });

  it("si falla el update, se borra el archivo NUEVO y el viejo queda intacto", async () => {
    const { admin } = fakeAdmin({ anterior: ANTERIOR, falloUpdate: new Error("update falló") });

    await expect(
      actualizarContenido(admin, "materiales", "m1", { storage_path_pendiente: PENDIENTE }),
    ).rejects.toThrow("update falló");

    expect(bitacora).toContain(`borrar:${ARCHIVO_NUEVO}`);
    expect(bitacora).not.toContain("borrar:archivos/viejo.pdf");
  });

  it("si no se puede borrar el archivo viejo, el cambio sigue valiendo y se avisa a Sentry", async () => {
    storage.borrarObjeto.mockRejectedValue(new Error("storage caído"));
    const { admin } = fakeAdmin({ anterior: ANTERIOR });

    await expect(
      actualizarContenido(admin, "materiales", "m1", { storage_path_pendiente: PENDIENTE }),
    ).resolves.toBeDefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toMatchObject({
      tags: { "materiales-huerfano": "true" },
    });
  });

  it("un reemplazo con un archivo de más de 50 MB se rechaza sin tocar la fila", async () => {
    storage.verificarObjeto.mockResolvedValue({ tamanoBytes: MAX_BYTES + 1, mime: "x" });
    const { admin, escrituras } = fakeAdmin({ anterior: ANTERIOR });

    await expect(
      actualizarContenido(admin, "materiales", "m1", { storage_path_pendiente: PENDIENTE }),
    ).rejects.toBeInstanceOf(ArchivoInvalido);
    expect(escrituras).toHaveLength(0);
  });
});

describe("borrarContenido('materiales')", () => {
  it("borra la fila y DESPUÉS el archivo", async () => {
    const { admin } = fakeAdmin({ anterior: ANTERIOR });

    const out = await borrarContenido(admin, "materiales", "m1");

    expect(bitacora).toEqual(["delete", "borrar:archivos/viejo.pdf"]);
    expect(out.resultado).toBeNull();
    expect((out.valorAnterior as Fila).id).toBe("m1");
  });

  it("si falla el borrado del archivo, la fila ya no existe y se avisa a Sentry", async () => {
    storage.borrarObjeto.mockRejectedValue(new Error("storage caído"));
    const { admin } = fakeAdmin({ anterior: ANTERIOR });

    await expect(borrarContenido(admin, "materiales", "m1")).resolves.toBeDefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("un id inexistente da ItemNoEncontrado y no borra ningún archivo", async () => {
    const { admin } = fakeAdmin({ anterior: null });

    await expect(borrarContenido(admin, "materiales", "no-existe")).rejects.toBeInstanceOf(
      ItemNoEncontrado,
    );
    expect(storage.borrarObjeto).not.toHaveBeenCalled();
  });
});
