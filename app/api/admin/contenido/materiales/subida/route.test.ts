// VGRP-88 — POST|DELETE /api/admin/contenido/materiales/subida, mockeados (sin Storage real).
// Mismo estilo que app/api/admin/contenido/[entidad]/route.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES } from "@/lib/materiales/tipos";

const mockRequireAdmin = vi.fn();
const mockCrearSubidaFirmada = vi.fn();
const mockBarrerPendientes = vi.fn();
const mockBorrarObjeto = vi.fn();
const mockCaptureException = vi.fn();
const afterCallbacks: (() => unknown)[] = [];

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: () => mockRequireAdmin() }));
vi.mock("@/lib/materiales/storage", () => ({
  crearSubidaFirmada: (...args: unknown[]) => mockCrearSubidaFirmada(...args),
  barrerPendientes: (...args: unknown[]) => mockBarrerPendientes(...args),
  borrarObjeto: (...args: unknown[]) => mockBorrarObjeto(...args),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));
// `after` corre el callback cuando termina la respuesta: acá se captura para ejecutarlo a mano.
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

const UUID = "123e4567-e89b-12d3-a456-426614174000";

function req(method: "POST" | "DELETE", body?: unknown): Request {
  return new Request("https://ogcircle.example/api/admin/contenido/materiales/subida", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const llamar = async (metodo: "POST" | "DELETE", body?: unknown) => {
  const mod = await import("./route");
  return mod[metodo](req(metodo, body));
};

const NO_AUTENTICADO = {
  ok: false,
  response: Response.json({ error: "No autenticado." }, { status: 401 }),
};
const NO_ADMIN = {
  ok: false,
  response: Response.json({ error: "No encontrado." }, { status: 404 }),
};

beforeEach(() => {
  vi.resetModules();
  afterCallbacks.length = 0;
  for (const m of [
    mockRequireAdmin,
    mockCrearSubidaFirmada,
    mockBarrerPendientes,
    mockBorrarObjeto,
    mockCaptureException,
  ]) {
    m.mockReset();
  }
  mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
  mockCrearSubidaFirmada.mockResolvedValue({
    path: `pendientes/${UUID}.pdf`,
    signedUrl: "https://storage/firmada",
    contentType: "application/pdf",
  });
});

describe("POST /materiales/subida", () => {
  it("declara export const dynamic = 'force-dynamic'", async () => {
    expect((await import("./route")).dynamic).toBe("force-dynamic");
  });

  it("sin sesión -> 401, sin tocar Storage", async () => {
    mockRequireAdmin.mockResolvedValue(NO_AUTENTICADO);

    const res = await llamar("POST", { nombreArchivo: "a.pdf", tamanoBytes: 10 });

    expect(res.status).toBe(401);
    expect(mockCrearSubidaFirmada).not.toHaveBeenCalled();
  });

  it("no admin -> 404 (nunca 403), sin tocar Storage", async () => {
    mockRequireAdmin.mockResolvedValue(NO_ADMIN);

    const res = await llamar("POST", { nombreArchivo: "a.pdf", tamanoBytes: 10 });

    expect(res.status).toBe(404);
    expect(mockCrearSubidaFirmada).not.toHaveBeenCalled();
  });

  it.each([
    ["sin body", undefined],
    ["sin nombre", { tamanoBytes: 10 }],
    ["tamaño cero", { nombreArchivo: "a.pdf", tamanoBytes: 0 }],
    ["tamaño negativo", { nombreArchivo: "a.pdf", tamanoBytes: -5 }],
    ["tamaño no entero", { nombreArchivo: "a.pdf", tamanoBytes: 1.5 }],
    ["tamaño como texto", { nombreArchivo: "a.pdf", tamanoBytes: "10" }],
  ])("body inválido (%s) -> 400", async (_, body) => {
    const res = await llamar("POST", body);

    expect(res.status).toBe(400);
    expect(mockCrearSubidaFirmada).not.toHaveBeenCalled();
  });

  it.each(["virus.exe", "foto.png", "notas.txt", "sin-extension", "a.pdf.exe"])(
    "extensión no permitida (%s) -> 400 con el mensaje para el admin",
    async (nombreArchivo) => {
      const res = await llamar("POST", { nombreArchivo, tamanoBytes: 10 });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/PDF, PowerPoint, Excel o Word/);
      expect(mockCrearSubidaFirmada).not.toHaveBeenCalled();
    },
  );

  it("más de 50 MB -> 400 que nombra el límite, ANTES de pedir una URL a Storage", async () => {
    const res = await llamar("POST", { nombreArchivo: "a.pdf", tamanoBytes: MAX_BYTES + 1 });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("50 MB");
    expect(mockCrearSubidaFirmada).not.toHaveBeenCalled();
  });

  it("exactamente 50 MB se acepta", async () => {
    const res = await llamar("POST", { nombreArchivo: "a.pdf", tamanoBytes: MAX_BYTES });

    expect(res.status).toBe(200);
  });

  it("ok -> 200 con path, URL firmada y contentType; pide la extensión en minúsculas", async () => {
    const res = await llamar("POST", { nombreArchivo: "Guía.PDF", tamanoBytes: 2_000_000 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      path: `pendientes/${UUID}.pdf`,
      signedUrl: "https://storage/firmada",
      contentType: "application/pdf",
    });
    expect(mockCrearSubidaFirmada).toHaveBeenCalledWith("pdf");
  });

  it("barre los pendientes viejos DESPUÉS de responder, no antes", async () => {
    await llamar("POST", { nombreArchivo: "a.pdf", tamanoBytes: 10 });

    expect(mockBarrerPendientes).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await afterCallbacks[0]?.();
    expect(mockBarrerPendientes).toHaveBeenCalledTimes(1);
  });

  it("si Storage falla -> 500 y se avisa a Sentry", async () => {
    mockCrearSubidaFirmada.mockRejectedValue(new Error("sin cupo"));

    const res = await llamar("POST", { nombreArchivo: "a.pdf", tamanoBytes: 10 });

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /materiales/subida", () => {
  it("sin sesión -> 401, no borra nada", async () => {
    mockRequireAdmin.mockResolvedValue(NO_AUTENTICADO);

    const res = await llamar("DELETE", { path: `pendientes/${UUID}.pdf` });

    expect(res.status).toBe(401);
    expect(mockBorrarObjeto).not.toHaveBeenCalled();
  });

  it("no admin -> 404, no borra nada", async () => {
    mockRequireAdmin.mockResolvedValue(NO_ADMIN);

    const res = await llamar("DELETE", { path: `pendientes/${UUID}.pdf` });

    expect(res.status).toBe(404);
    expect(mockBorrarObjeto).not.toHaveBeenCalled();
  });

  it("descarta un pendiente -> 204 sin cuerpo", async () => {
    const res = await llamar("DELETE", { path: `pendientes/${UUID}.docx` });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(mockBorrarObjeto).toHaveBeenCalledWith(`pendientes/${UUID}.docx`);
  });

  it.each([
    `archivos/${UUID}.pdf`,
    `pendientes/../archivos/${UUID}.pdf`,
    `pendientes/${UUID}.exe`,
    "pendientes/otro.pdf",
    "",
  ])("NUNCA borra algo que no sea un pendiente válido (%s) -> 400", async (path) => {
    const res = await llamar("DELETE", { path });

    expect(res.status).toBe(400);
    expect(mockBorrarObjeto).not.toHaveBeenCalled();
  });

  it("body inválido -> 400", async () => {
    const res = await llamar("DELETE", { otro: 1 });

    expect(res.status).toBe(400);
    expect(mockBorrarObjeto).not.toHaveBeenCalled();
  });

  it("si Storage falla -> 500 y se avisa a Sentry", async () => {
    mockBorrarObjeto.mockRejectedValue(new Error("denegado"));

    const res = await llamar("DELETE", { path: `pendientes/${UUID}.pdf` });

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
