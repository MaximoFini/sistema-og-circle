// Foto de perfil (specs/foto-perfil-agentes-profesionales) — tests unitarios de
// PUT|DELETE /api/admin/contenido/[entidad]/[id]/foto. Mismo estilo que
// ../route.test.ts: base y Storage mockeados (lib/fotos/mutaciones), pero
// `procesarFoto` corre REAL con sharp, así las validaciones de imagen se prueban
// de verdad. La integración contra Supabase real está en
// test/integration/admin-foto-contenido.test.ts.

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

class ItemNoEncontradoMock extends Error {
  constructor() {
    super("no existe");
    this.name = "ItemNoEncontrado";
  }
}

const mockRequireAdmin = vi.fn();
const mockCambiarFoto = vi.fn();
const mockQuitarFoto = vi.fn();
const mockLeerFoto = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockRevalidateTag = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/data/admin/contenido", () => ({
  ItemNoEncontrado: ItemNoEncontradoMock,
  TAG_POR_ENTIDAD: { agentes: "grilla-agentes", profesionales: "grilla-profesionales" },
}));

vi.mock("@/lib/fotos/mutaciones", () => ({
  cambiarFoto: (...args: unknown[]) => mockCambiarFoto(...args),
  quitarFoto: (...args: unknown[]) => mockQuitarFoto(...args),
  leerFoto: (...args: unknown[]) => mockLeerFoto(...args),
}));

vi.mock("@/lib/data/admin/audit-log", () => ({
  conAuditoria: (...args: unknown[]) => mockConAuditoria(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const UUID = "11111111-1111-4111-8111-111111111111";

/** Imagen real como Blob. `tipo` es el Content-Type DECLARADO (puede mentir). */
async function imagen(
  ancho = 600,
  alto = 600,
  formato: "jpeg" | "png" | "gif" = "jpeg",
  tipo = "image/jpeg",
): Promise<Blob> {
  const buffer = await sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .toFormat(formato)
    .toBuffer();
  return new Blob([new Uint8Array(buffer)], { type: tipo });
}

function reqPut(archivo?: Blob): Request {
  const form = new FormData();
  if (archivo) form.set("foto", archivo, "foto.jpg");
  return new Request(`https://ogcircle.example/api/admin/contenido/agentes/${UUID}/foto`, {
    method: "PUT",
    body: form,
  });
}

async function callPut(entidad: string, id: string, archivo?: Blob) {
  const { PUT } = await import("./route");
  return PUT(reqPut(archivo), { params: Promise.resolve({ entidad, id }) });
}

async function callDelete(entidad: string, id: string) {
  const { DELETE } = await import("./route");
  return DELETE(new Request("https://ogcircle.example/x", { method: "DELETE" }), {
    params: Promise.resolve({ entidad, id }),
  });
}

describe("PUT|DELETE /api/admin/contenido/[entidad]/[id]/foto", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      mockRequireAdmin,
      mockCambiarFoto,
      mockQuitarFoto,
      mockLeerFoto,
      mockConAuditoria,
      mockCreateServiceRoleClient,
      mockRevalidateTag,
      mockCaptureException,
    ]) {
      m.mockReset();
    }

    mockRequireAdmin.mockResolvedValue({ ok: true, actorId: "admin-1" });
    mockCreateServiceRoleClient.mockReturnValue({ marker: "admin-client" });
    mockConAuditoria.mockImplementation(
      async (_admin: unknown, _meta: unknown, mutacion: () => Promise<{ resultado: unknown }>) => {
        const r = await mutacion();
        return r.resultado;
      },
    );
    mockCambiarFoto.mockResolvedValue({
      resultado: { fotoUrl: "https://x/foto.webp" },
      valorAnterior: { foto_path: null },
      valorNuevo: { foto_path: "agentes/x/y.webp" },
      entidadId: UUID,
    });
  });

  describe("guard y ruta", () => {
    it("sin sesión → devuelve la respuesta del guard (401) sin tocar nada", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No autenticado." }, { status: 401 }),
      });
      const res = await callPut("agentes", UUID, await imagen());
      expect(res.status).toBe(401);
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      expect(mockCambiarFoto).not.toHaveBeenCalled();
    });

    it("no admin → 404 del guard, en PUT y en DELETE", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No encontrado." }, { status: 404 }),
      });
      expect((await callPut("agentes", UUID, await imagen())).status).toBe(404);
      expect((await callDelete("agentes", UUID)).status).toBe(404);
      expect(mockCambiarFoto).not.toHaveBeenCalled();
      expect(mockQuitarFoto).not.toHaveBeenCalled();
    });

    it.each(["videos", "servicios_financieros", "profiles"])(
      "entidad sin foto (%s) → 400 sin tocar la base",
      async (entidad) => {
        const res = await callPut(entidad, UUID, await imagen());
        expect(res.status).toBe(400);
        expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      },
    );

    it("id que no es uuid → 404", async () => {
      expect((await callPut("agentes", "no-uuid", await imagen())).status).toBe(404);
      expect((await callDelete("agentes", "no-uuid")).status).toBe(404);
    });
  });

  describe("PUT", () => {
    it("sin archivo → 400", async () => {
      const res = await callPut("agentes", UUID);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Falta la foto." });
    });

    it("archivo que no es imagen → 400 con mensaje, sin subir nada", async () => {
      const res = await callPut("agentes", UUID, new Blob(["hola"], { type: "image/jpeg" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/no es una imagen/);
      expect(mockCambiarFoto).not.toHaveBeenCalled();
    });

    it("GIF → 400 (formato real, aunque declare image/jpeg)", async () => {
      const res = await callPut("agentes", UUID, await imagen(600, 600, "gif", "image/jpeg"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Formato no permitido/);
    });

    it("imagen de menos de 256 px → 400", async () => {
      const res = await callPut("agentes", UUID, await imagen(120, 120));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/al menos 256/);
    });

    it("archivo de más de 2 MB → 400", async () => {
      const res = await callPut("agentes", UUID, new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/demasiado pesada/);
    });

    it("ok → procesa a WebP 512, audita, revalida y devuelve la URL", async () => {
      const res = await callPut("profesionales", UUID, await imagen(900, 700));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ fotoUrl: "https://x/foto.webp" });

      const [, entidad, id, webp] = mockCambiarFoto.mock.calls[0] as [
        unknown,
        string,
        string,
        Buffer,
      ];
      expect(entidad).toBe("profesionales");
      expect(id).toBe(UUID);
      const meta = await sharp(webp).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 512]);

      expect(mockConAuditoria.mock.calls[0][1]).toEqual({
        actorId: "admin-1",
        accion: "cambiar_foto_contenido",
        entidad: "profesionales",
        entidadId: UUID,
      });
      expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-profesionales");
    });

    it("fila inexistente → 404 sin revalidar", async () => {
      mockCambiarFoto.mockRejectedValue(new ItemNoEncontradoMock());
      const res = await callPut("agentes", UUID, await imagen());
      expect(res.status).toBe(404);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it("error de Storage/DB → 500 y a Sentry", async () => {
      mockCambiarFoto.mockRejectedValue(new Error("storage caído"));
      const res = await callPut("agentes", UUID, await imagen());
      expect(res.status).toBe(500);
      expect(mockCaptureException).toHaveBeenCalledOnce();
    });
  });

  describe("DELETE", () => {
    it("con foto → la quita, audita y revalida", async () => {
      const anterior = { nombre: "Ana", foto_path: "agentes/x/vieja.webp" };
      mockLeerFoto.mockResolvedValue(anterior);
      mockQuitarFoto.mockResolvedValue({
        resultado: null,
        valorAnterior: anterior,
        valorNuevo: { nombre: "Ana", foto_path: null },
        entidadId: UUID,
      });
      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(200);
      expect(mockQuitarFoto).toHaveBeenCalledWith(
        { marker: "admin-client" },
        "agentes",
        UUID,
        anterior,
      );
      expect(mockConAuditoria.mock.calls[0][1]).toMatchObject({ accion: "quitar_foto_contenido" });
      expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
    });

    it("sin foto previa → 200 idempotente, sin auditar", async () => {
      mockLeerFoto.mockResolvedValue({ nombre: "Ana", foto_path: null });
      const res = await callDelete("agentes", UUID);
      expect(res.status).toBe(200);
      expect(mockConAuditoria).not.toHaveBeenCalled();
      expect(mockQuitarFoto).not.toHaveBeenCalled();
    });

    it("fila inexistente → 404", async () => {
      mockLeerFoto.mockRejectedValue(new ItemNoEncontradoMock());
      expect((await callDelete("agentes", UUID)).status).toBe(404);
    });
  });
});
