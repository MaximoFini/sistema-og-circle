// VGRP-88 — lib/materiales/storage.ts con un bucket falso: el layout de paths, la
// verificación con la metadata real, el movimiento pendientes → archivos, la URL de descarga
// y el barrido de huérfanos. La API real de Storage se ejercita en los e2e del admin.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATH_PENDIENTE_REGEX } from "./tipos";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));

const bucket = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  exists: vi.fn(),
  info: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  list: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn());

vi.mock("../supabase/service-role", () => ({
  createServiceRoleClient: () => ({ storage: { from } }),
}));

const {
  barrerPendientes,
  borrarObjeto,
  BUCKET_MATERIALES,
  crearSubidaFirmada,
  moverAArchivos,
  urlDescarga,
  verificarObjeto,
} = await import("./storage");

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const HORA = 60 * 60 * 1000;
const hace = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  captureException.mockReset();
  from.mockReset();
  from.mockReturnValue(bucket);
  for (const fn of Object.values(bucket)) fn.mockReset();
});

describe("crearSubidaFirmada", () => {
  it("pide una URL para un path pendientes/<uuid>.<ext> nuevo, en el bucket privado", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "https://storage/firmada?token=t", token: "t", path: "x" },
      error: null,
    });

    const subida = await crearSubidaFirmada("pptx");

    expect(from).toHaveBeenCalledWith(BUCKET_MATERIALES);
    expect(subida.path).toMatch(PATH_PENDIENTE_REGEX);
    expect(subida.path.endsWith(".pptx")).toBe(true);
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(subida.path);
    expect(subida.signedUrl).toBe("https://storage/firmada?token=t");
  });

  it("devuelve el Content-Type que corresponde a la extensión", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "u", token: "t", path: "p" },
      error: null,
    });

    expect((await crearSubidaFirmada("pdf")).contentType).toBe("application/pdf");
    expect((await crearSubidaFirmada("csv")).contentType).toBe("text/csv");
    expect((await crearSubidaFirmada("docx")).contentType).toContain("wordprocessingml");
  });

  it("cada llamada genera un path distinto", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: "u", token: "t", path: "p" },
      error: null,
    });

    const a = await crearSubidaFirmada("pdf");
    const b = await crearSubidaFirmada("pdf");

    expect(a.path).not.toBe(b.path);
  });

  it("si Storage falla, propaga el error", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error("sin cupo") });

    await expect(crearSubidaFirmada("pdf")).rejects.toThrow("sin cupo");
  });
});

describe("verificarObjeto", () => {
  it("un objeto que no existe da null y ni consulta la metadata", async () => {
    bucket.exists.mockResolvedValue({ data: false, error: null });

    await expect(verificarObjeto(`pendientes/${UUID}.pdf`)).resolves.toBeNull();
    expect(bucket.info).not.toHaveBeenCalled();
  });

  it("devuelve el tamaño y el mime REALES guardados por Storage", async () => {
    bucket.exists.mockResolvedValue({ data: true, error: null });
    bucket.info.mockResolvedValue({
      data: { size: 2_400_000, contentType: "application/pdf" },
      error: null,
    });

    await expect(verificarObjeto(`pendientes/${UUID}.pdf`)).resolves.toEqual({
      tamanoBytes: 2_400_000,
      mime: "application/pdf",
    });
  });

  it("sin tamaño en la metadata cuenta como 0 (se rechaza como vacío más arriba)", async () => {
    bucket.exists.mockResolvedValue({ data: true, error: null });
    bucket.info.mockResolvedValue({ data: {}, error: null });

    await expect(verificarObjeto("pendientes/x.pdf")).resolves.toEqual({
      tamanoBytes: 0,
      mime: "",
    });
  });

  it("un error de Storage se propaga, no se confunde con 'no existe'", async () => {
    bucket.exists.mockResolvedValue({ data: false, error: new Error("timeout") });

    await expect(verificarObjeto("pendientes/x.pdf")).rejects.toThrow("timeout");
  });
});

describe("moverAArchivos", () => {
  it("mueve a archivos/<uuid nuevo>.<ext> conservando la extensión", async () => {
    bucket.move.mockResolvedValue({ data: {}, error: null });

    const destino = await moverAArchivos(`pendientes/${UUID}.xlsx`);

    expect(destino).toMatch(/^archivos\/[0-9a-f-]{36}\.xlsx$/);
    expect(destino).not.toContain(UUID);
    expect(bucket.move).toHaveBeenCalledWith(`pendientes/${UUID}.xlsx`, destino);
  });

  it("NO mueve nada que no sea un path pendiente válido", async () => {
    for (const malo of [`archivos/${UUID}.pdf`, "pendientes/../archivos/x.pdf", "otra/cosa.pdf"]) {
      await expect(moverAArchivos(malo)).rejects.toThrow(/path pendiente/);
    }
    expect(bucket.move).not.toHaveBeenCalled();
  });

  it("si Storage falla, propaga el error", async () => {
    bucket.move.mockResolvedValue({ data: null, error: new Error("no se pudo mover") });

    await expect(moverAArchivos(`pendientes/${UUID}.pdf`)).rejects.toThrow("no se pudo mover");
  });
});

describe("borrarObjeto", () => {
  it("borra el path", async () => {
    bucket.remove.mockResolvedValue({ data: [], error: null });

    await borrarObjeto("archivos/a.pdf");

    expect(bucket.remove).toHaveBeenCalledWith(["archivos/a.pdf"]);
  });

  it("es idempotente: borrar algo que ya no está no es un error", async () => {
    bucket.remove.mockResolvedValue({ data: [], error: null });

    await expect(borrarObjeto("archivos/ya-borrado.pdf")).resolves.toBeUndefined();
  });

  it("un error real de Storage se propaga", async () => {
    bucket.remove.mockResolvedValue({ data: null, error: new Error("denegado") });

    await expect(borrarObjeto("archivos/a.pdf")).rejects.toThrow("denegado");
  });
});

describe("urlDescarga", () => {
  it("firma por 120 s por defecto y agrega el nombre de descarga con UNA sola codificación", async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage/descarga?token=t" },
      error: null,
    });

    const url = await urlDescarga("archivos/a.pdf", "Guía de importación [v2].pdf");

    // Sin la opción `download` de storage-js: la codifica dos veces y el nombre llega roto
    // ("Gu%C3%ADa…", "%5Bv2%5D") al Content-Disposition.
    expect(bucket.createSignedUrl).toHaveBeenCalledWith("archivos/a.pdf", 120);
    const parametros = new URL(url as string).searchParams;
    expect(parametros.get("token")).toBe("t");
    expect(parametros.get("download")).toBe("Guía de importación [v2].pdf");
    expect(url).not.toContain("%25"); // nada escapado dos veces
  });

  it("acepta otra duración", async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage/d?token=t" },
      error: null,
    });

    await urlDescarga("archivos/a.pdf", "a.pdf", 30);

    expect(bucket.createSignedUrl).toHaveBeenCalledWith("archivos/a.pdf", 30);
  });

  it("si Storage falla devuelve null y avisa a Sentry (no tira)", async () => {
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: new Error("objeto perdido") });

    await expect(urlDescarga("archivos/a.pdf", "a.pdf")).resolves.toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

describe("barrerPendientes", () => {
  it("borra solo los pendientes de más de 24 h", async () => {
    bucket.list.mockResolvedValue({
      data: [
        { id: "1", name: "viejo.pdf", created_at: hace(30 * HORA) },
        { id: "2", name: "reciente.pdf", created_at: hace(1 * HORA) },
        { id: "3", name: "justo-antes.pdf", created_at: hace(25 * HORA) },
        { id: "4", name: "justo-despues.pdf", created_at: hace(23 * HORA) },
      ],
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: [], error: null });

    await barrerPendientes();

    expect(bucket.list).toHaveBeenCalledWith("pendientes", expect.objectContaining({ limit: 100 }));
    expect(bucket.remove).toHaveBeenCalledWith([
      "pendientes/viejo.pdf",
      "pendientes/justo-antes.pdf",
    ]);
  });

  it("ignora las 'carpetas' y placeholders (sin id) aunque parezcan viejos", async () => {
    bucket.list.mockResolvedValue({
      data: [
        { id: null, name: ".emptyFolderPlaceholder", created_at: hace(90 * HORA) },
        { id: null, name: "subcarpeta", created_at: null },
      ],
      error: null,
    });

    await barrerPendientes();

    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("sin nada viejo no llama a remove", async () => {
    bucket.list.mockResolvedValue({
      data: [{ id: "1", name: "nuevo.pdf", created_at: hace(HORA) }],
      error: null,
    });

    await barrerPendientes();

    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("nunca tira: si list falla avisa a Sentry y sigue (no puede impedir una subida)", async () => {
    bucket.list.mockResolvedValue({ data: null, error: new Error("list falló") });

    await expect(barrerPendientes()).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toMatchObject({
      tags: { "materiales-barrido": "true" },
    });
  });

  it("nunca tira: si remove falla tampoco", async () => {
    bucket.list.mockResolvedValue({
      data: [{ id: "1", name: "viejo.pdf", created_at: hace(48 * HORA) }],
      error: null,
    });
    bucket.remove.mockResolvedValue({ data: null, error: new Error("remove falló") });

    await expect(barrerPendientes()).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
