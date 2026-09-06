// =============================================================================
// VGRP-17 / Bloque 5 (VGRP-44) — tests del middleware de sesión.
//
// Mockea `@supabase/ssr` para controlar `auth.getClaims()` sin pegarle a
// ningún proyecto real de Supabase — es lo único que el middleware le pide al
// cliente (nunca `getUser()`, ver el comentario de middleware.ts). Mismo
// patrón que app/api/auth/send-email/route.test.ts: `vi.resetModules()` +
// import dinámico por test, `vi.stubEnv`/`unstubAllEnvs` para las env vars de
// Supabase (el cliente está mockeado, así que los valores no necesitan ser
// reales, sólo truthy para que `getEnv()` no explote).
//
// No se testea acá `safeRedirectPath()` (eso ya está cubierto en
// lib/auth/redirect.test.ts) ni el refresh de cookies de `withRefreshedCookies`
// (requeriría simular lo que hace `@supabase/ssr` internamente al llamar
// `setAll`, que es justo lo que este archivo mockea afuera) — sólo el
// comportamiento de gating que le compete al middleware.
// =============================================================================

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetClaims = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: mockGetClaims },
  }),
}));

// Shape real de `getClaims()` con sesión válida (ver middleware.ts): `data`
// truthy, `error` null. El contenido de `claims` no importa acá — el
// middleware no lo lee, sólo chequea `!error && !!data`.
const CON_SESION = { data: { claims: { sub: "user-123" } }, error: null };
// Sin sesión, `data` viene `undefined` (NO `null`) — es la razón por la que
// middleware.ts usa `!data` y no `data !== null`. Se replica ese shape acá
// para no falsear el test contra una implementación que sí distinga null de
// undefined.
const SIN_SESION = { data: undefined, error: { message: "no session" } };

// VGRP-35 — sesión válida con el claim de rol que el middleware lee para el
// área de admin (`data.claims.app_metadata.rol`). Con `rol='user'` el
// middleware corta `/admin` con 404; con `rol='admin'` pasa.
const CON_SESION_USER = {
  data: { claims: { sub: "user-123", app_metadata: { rol: "user" } } },
  error: null,
};
const CON_SESION_ADMIN = {
  data: { claims: { sub: "admin-1", app_metadata: { rol: "admin" } } },
  error: null,
};

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetClaims.mockReset();
    // El middleware crea el cliente de Supabase (y por lo tanto exige estas
    // env vars) en TODA request, pública o privada — así que se stubean acá
    // afuera para las dos ramas del describe.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://hsmodrhbwkromoixrxrt.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "clave-de-prueba-no-real");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("ruta privada sin sesión", () => {
    it("redirige a /login (307)", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/dashboard"));

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      expect(new URL(location as string).pathname).toBe("/login");
    });

    it("preserva el destino original (path + querystring) en ?next=", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/dashboard/reportes?tab=swift"));

      const location = res.headers.get("location");
      expect(location).not.toBeNull();
      // Se compara por valor DECODEADO (lo que devuelve `URLSearchParams.get`)
      // y no por string crudo, para no acoplarse al encoding exacto que
      // `URLSearchParams.set` haya usado en middleware.ts.
      const next = new URL(location as string).searchParams.get("next");
      expect(next).toBe("/dashboard/reportes?tab=swift");
    });

    it("nunca deja pasar contenido privado (fail-closed), en una ruta existente y en una inventada", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      // `/dashboard/algo/nuevo` no existe todavía en el árbol de la app: como
      // el matcher es negativo (todo entra salvo lo excluido explícitamente),
      // tiene que quedar protegida igual, sin que nadie la haya agregado a
      // ninguna lista.
      for (const path of ["/dashboard", "/dashboard/algo/nuevo"]) {
        const res = await middleware(req(path));
        // Nunca un pass-through con 200: siempre redirect. Es la propiedad
        // que evita el flash de contenido privado.
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).not.toBeNull();
      }
    });
  });

  describe("ruta pública sin sesión", () => {
    it.each([
      ["/", "PUBLIC_EXACT"],
      ["/login", "PUBLIC_PREFIXES"],
      ["/recuperar/nueva", "sub-path de un prefijo (/recuperar)"],
    ])("%s pasa (%s) — sin redirect, sin 401", async (path) => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req(path));

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("ruta privada con sesión", () => {
    it("no redirige", async () => {
      mockGetClaims.mockResolvedValue(CON_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/dashboard"));

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("rutas /api/*", () => {
    it("una ruta de API privada sin sesión devuelve 401 JSON, no un redirect", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/api/inventado"));

      expect(res.status).toBe(401);
      expect(res.headers.get("location")).toBeNull();
      const body = await res.json();
      expect(body).toEqual({ error: expect.any(String) });
    });

    it("/api/auth/send-email es pública: pasa sin sesión y sin 401", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/api/auth/send-email"));

      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  // VGRP-35 — capa de ROL sobre `/admin` y `/api/admin`. Suma al fail-closed
  // de sesión: con sesión pero `rol != 'admin'`, el área devuelve 404 (nunca
  // 403, nunca una pantalla parcial).
  describe("área de admin (VGRP-35)", () => {
    it("sin sesión: /admin redirige a /login?next=/admin (307)", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/admin"));

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(new URL(location as string).pathname).toBe("/login");
      expect(new URL(location as string).searchParams.get("next")).toBe("/admin");
    });

    it("sin sesión: /api/admin/x devuelve 401 JSON, no un redirect", async () => {
      mockGetClaims.mockResolvedValue(SIN_SESION);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/api/admin/usuarios/1/nivel"));

      expect(res.status).toBe(401);
      expect(res.headers.get("location")).toBeNull();
    });

    it("con sesión y rol='user': GET /admin devuelve 404 (no 307, no 200)", async () => {
      mockGetClaims.mockResolvedValue(CON_SESION_USER);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/admin"));

      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull();
    });

    it("con sesión y rol='user': GET /api/admin/x devuelve 404 JSON", async () => {
      mockGetClaims.mockResolvedValue(CON_SESION_USER);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/api/admin/usuarios/1/nivel"));

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: expect.any(String) });
    });

    it("con sesión y rol='user': una ruta /admin/inventada (no existe en el árbol) igual da 404 (fail-closed por prefijo)", async () => {
      mockGetClaims.mockResolvedValue(CON_SESION_USER);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/admin/inventada/sub"));

      expect(res.status).toBe(404);
    });

    it("con sesión y rol='admin': /admin y /api/admin/x pasan (200, sin redirect)", async () => {
      mockGetClaims.mockResolvedValue(CON_SESION_ADMIN);
      const { middleware } = await import("./middleware");

      for (const path of ["/admin", "/admin/auditoria", "/api/admin/usuarios/1/nivel"]) {
        const res = await middleware(req(path));
        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    });

    it("el claim de rol NO afecta rutas fuera del área admin: /dashboard con rol='user' pasa normal", async () => {
      mockGetClaims.mockResolvedValue(CON_SESION_USER);
      const { middleware } = await import("./middleware");

      const res = await middleware(req("/dashboard"));

      expect(res.status).toBe(200);
    });
  });
});
