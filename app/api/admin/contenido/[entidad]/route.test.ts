// VGRP-49 — tests unitarios (mockeados, sin Postgres real) de
// GET|POST /api/admin/contenido/[entidad]. No existía route.test.ts para esta
// ruta (verificado). Mismo estilo que
// app/api/admin/usuarios/[id]/nivel/route.test.ts: vi.mock de las
// dependencias + import dinámico del módulo bajo test tras vi.resetModules().
// Complementa a test/integration/admin-contenido.test.ts (handler real contra
// Supabase real, sólo requireAdmin/revalidateTag mockeados).

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockRequireAdmin = vi.fn();
const mockListarContenido = vi.fn();
const mockCrearContenido = vi.fn();
const mockConAuditoria = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockRevalidateTag = vi.fn();
const mockCaptureException = vi.fn();

const ENTIDADES_REALES = ["agentes", "videos", "profesionales", "servicios_financieros"] as const;
const TAG_POR_ENTIDAD: Record<(typeof ENTIDADES_REALES)[number], string> = {
  agentes: "grilla-agentes",
  videos: "grilla-videos",
  profesionales: "grilla-profesionales",
  servicios_financieros: "grilla-servicios",
};

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/data/admin/contenido", () => ({
  esEntidadValida: (v: string): boolean => (ENTIDADES_REALES as readonly string[]).includes(v),
  listarContenido: (...args: unknown[]) => mockListarContenido(...args),
  crearContenido: (...args: unknown[]) => mockCrearContenido(...args),
  TAG_POR_ENTIDAD,
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

function req(method: "GET" | "POST", body?: unknown): Request {
  return new Request("https://ogcircle.example/api/admin/contenido/agentes", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function callGet(entidad: string) {
  const { GET } = await import("./route");
  return GET(req("GET"), { params: Promise.resolve({ entidad }) });
}

async function callPost(entidad: string, body: unknown) {
  const { POST } = await import("./route");
  return POST(req("POST", body), { params: Promise.resolve({ entidad }) });
}

/** Un z.ZodError real (safeParse, no try/catch) — evita simular la forma del
 *  error a mano, y evita un `as z.ZodError` sobre algo que podría no estarlo. */
function crearZodErrorReal(): z.ZodError {
  const resultado = z.object({ nombre: z.string().min(1) }).safeParse({});
  if (resultado.success) throw new Error("se esperaba que este parse fallara");
  return resultado.error;
}

describe("GET|POST /api/admin/contenido/[entidad]", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [
      mockRequireAdmin,
      mockListarContenido,
      mockCrearContenido,
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("dynamic export", () => {
    it("declara export const dynamic = 'force-dynamic'", async () => {
      const mod = await import("./route");
      expect(mod.dynamic).toBe("force-dynamic");
    });
  });

  describe("GET", () => {
    it("sin sesión -> 401, no llama a listarContenido", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No autenticado." }, { status: 401 }),
      });
      const res = await callGet("agentes");
      expect(res.status).toBe(401);
      expect(mockListarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it("rol != admin -> 404, no llama a listarContenido ni instancia el cliente de service role", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No encontrado." }, { status: 404 }),
      });
      const res = await callGet("agentes");
      expect(res.status).toBe(404);
      expect(mockListarContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it.each(["profiles", "pagos"])(
      "%s (tabla real fuera de la lista blanca) -> 400, sin tocar la base",
      async (entidad) => {
        const res = await callGet(entidad);
        expect(res.status).toBe(400);
        expect(mockListarContenido).not.toHaveBeenCalled();
        expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
      },
    );

    it("entidad inventada -> 400, sin tocar la base", async () => {
      const res = await callGet("agentes; drop table profiles;");
      expect(res.status).toBe(400);
      expect(mockListarContenido).not.toHaveBeenCalled();
    });

    it("happy path -> 200 { items }", async () => {
      mockListarContenido.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
      const res = await callGet("agentes");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [{ id: "a1" }, { id: "a2" }] });
      expect(mockListarContenido).toHaveBeenCalledWith({ marker: "admin-client" }, "agentes");
    });
  });

  describe("POST", () => {
    it("sin sesión -> 401, no llama a crearContenido ni a conAuditoria", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No autenticado." }, { status: 401 }),
      });
      const res = await callPost("agentes", { nombre: "x" });
      expect(res.status).toBe(401);
      expect(mockCrearContenido).not.toHaveBeenCalled();
      expect(mockConAuditoria).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it("rol != admin -> 404, no llama a crearContenido ni instancia el cliente de service role", async () => {
      mockRequireAdmin.mockResolvedValue({
        ok: false,
        response: Response.json({ error: "No encontrado." }, { status: 404 }),
      });
      const res = await callPost("agentes", { nombre: "x" });
      expect(res.status).toBe(404);
      expect(mockCrearContenido).not.toHaveBeenCalled();
      expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    });

    it.each(["profiles", "pagos"])(
      "POST a %s (tabla real fuera de lista blanca) -> 400, sin tocar la base, sin revalidar",
      async (entidad) => {
        const res = await callPost(entidad, { nombre: "x" });
        expect(res.status).toBe(400);
        expect(mockCrearContenido).not.toHaveBeenCalled();
        expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
        expect(mockRevalidateTag).not.toHaveBeenCalled();
      },
    );

    it("body inválido (Zod real) -> 400 con fieldErrors, cero escrituras, revalidateTag NO se llama", async () => {
      mockCrearContenido.mockRejectedValue(crearZodErrorReal());

      const res = await callPost("agentes", { nombre: "" });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.fieldErrors).toBeDefined();
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it("happy path -> 200 + fila creada + conAuditoria con accion='crear_contenido' + revalidateTag('grilla-agentes') UNA vez", async () => {
      mockCrearContenido.mockResolvedValue({
        resultado: { id: "nuevo-1", nombre: "Test" },
        valorAnterior: null,
        valorNuevo: { id: "nuevo-1", nombre: "Test" },
        entidadId: "nuevo-1",
      });

      const res = await callPost("agentes", { nombre: "Test" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: "nuevo-1", nombre: "Test" });

      expect(mockConAuditoria).toHaveBeenCalledWith(
        { marker: "admin-client" },
        expect.objectContaining({
          actorId: "admin-1",
          accion: "crear_contenido",
          entidad: "agentes",
        }),
        expect.any(Function),
      );
      expect(mockRevalidateTag).toHaveBeenCalledTimes(1);
      expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-agentes");
    });

    it("una escritura FALLIDA (error inesperado, no-Zod) no revalida nada", async () => {
      mockCrearContenido.mockRejectedValue(new Error("boom de postgres"));

      const res = await callPost("agentes", { nombre: "Test" });
      expect(res.status).toBe(500);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalled();
    });
  });

  // VGRP-49 punto 6 — simetría de revalidateTag: el tag que usa esta ruta
  // (TAG_POR_ENTIDAD[entidad]) tiene que ser EXACTAMENTE el mismo string con
  // el que lib/data/videos.ts registra su unstable_cache. Comparar los dos
  // extremos (no un valor hardcodeado en cada lado): lib/data/videos.ts ya
  // importa TAG_POR_ENTIDAD directo de lib/data/admin/contenido.ts (no
  // redeclara el string), así que hoy son el MISMO binding por construcción
  // — lo que este test fija es justamente esa arquitectura: si algún día
  // alguien reemplaza `TAG_POR_ENTIDAD.videos` por un string literal
  // hardcodeado en videos.ts (la única forma real de desincronizarlos sin
  // tocar admin/contenido.ts), este test se pone rojo.
  describe("simetría del tag de revalidateTag con lib/data/videos.ts", () => {
    it("lib/data/videos.ts usa TAG_POR_ENTIDAD.videos (el símbolo importado), no un string hardcodeado", () => {
      const videosPath = path.resolve(__dirname, "../../../../../lib/data/videos.ts");
      const contenido = readFileSync(videosPath, "utf8");

      expect(contenido).toContain('import { TAG_POR_ENTIDAD } from "./admin/contenido"');
      expect(contenido).toContain("tags: [TAG_POR_ENTIDAD.videos]");
      // Nunca un string hardcodeado del tag real en este archivo — si
      // apareciera, sería la señal de que alguien lo desacopló del import.
      expect(contenido).not.toContain('"grilla-videos"');
    });

    it("el valor real (fuente: lib/data/admin/contenido.ts, sin mockear) de TAG_POR_ENTIDAD.videos es 'grilla-videos'", () => {
      // Lectura de archivo en vez de import: este describe corre con
      // "@/lib/data/admin/contenido" mockeado para el resto del suite (ver
      // vi.mock arriba) — importar el módulo real acá adentro requeriría
      // desmockearlo y volver a mockearlo para no afectar los demás tests.
      // Leer el archivo fuente evita esa fragilidad y de paso confirma que el
      // valor en el código real (no en el mock de este archivo) es el mismo
      // que usa la aserción de arriba.
      const contenidoPath = path.resolve(__dirname, "../../../../../lib/data/admin/contenido.ts");
      const contenido = readFileSync(contenidoPath, "utf8");
      const match = contenido.match(/videos:\s*"([^"]+)"/);
      expect(match?.[1]).toBe("grilla-videos");
    });
  });
});
