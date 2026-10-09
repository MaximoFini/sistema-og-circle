// Foto de perfil (specs/foto-perfil-agentes-profesionales) — integración real
// de lib/fotos/storage.ts contra el bucket `fotos-directorio` del proyecto de
// Supabase (docs/TESTING.md). Requiere la migración 20261009120000_foto_directorio.sql.
//
// Las rutas usan un id aleatorio que no corresponde a ninguna fila: cada test
// borra lo que sube en su afterEach.

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FOTO_BUCKET } from "../../lib/fotos/constantes";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import "../helpers/load-env";

const mockCaptureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const { borrarFoto, subirFoto, urlPublicaFoto } = await import("../../lib/fotos/storage");

const admin = createTestAdminClient();
const subidas: string[] = [];

function webpDePrueba(): Promise<Buffer> {
  return sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .webp()
    .toBuffer();
}

afterEach(async () => {
  if (subidas.length > 0) await admin.storage.from(FOTO_BUCKET).remove(subidas.splice(0));
  mockCaptureException.mockReset();
});

describe("lib/fotos/storage", () => {
  it("sube una foto y queda accesible por su URL pública", async () => {
    const id = randomUUID();
    const path = await subirFoto(admin, "agentes", id, await webpDePrueba());
    subidas.push(path);

    expect(path).toMatch(new RegExp(`^agentes/${id}/[0-9a-f-]{36}\\.webp$`));

    const res = await fetch(urlPublicaFoto(path) as string);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
  });

  it("cada subida genera una ruta distinta (URL inmutable)", async () => {
    const id = randomUUID();
    const webp = await webpDePrueba();
    const a = await subirFoto(admin, "profesionales", id, webp);
    const b = await subirFoto(admin, "profesionales", id, webp);
    subidas.push(a, b);
    expect(a).not.toBe(b);
  });

  it("borrarFoto elimina el objeto", async () => {
    const path = await subirFoto(admin, "agentes", randomUUID(), await webpDePrueba());
    expect(await borrarFoto(admin, path)).toBe(true);

    const res = await fetch(urlPublicaFoto(path) as string);
    expect(res.status).not.toBe(200);
  });

  it("borrarFoto con null o con una ruta inexistente no falla", async () => {
    expect(await borrarFoto(admin, null)).toBe(true);
    expect(await borrarFoto(admin, `agentes/${randomUUID()}/no-existe.webp`)).toBe(true);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("anon no puede subir al bucket", async () => {
    const anon = createTestAnonClient();
    const path = `agentes/${randomUUID()}/intruso.webp`;
    const { error } = await anon.storage
      .from(FOTO_BUCKET)
      .upload(path, await webpDePrueba(), { contentType: "image/webp" });
    if (!error) subidas.push(path);
    expect(error).not.toBeNull();
  });

  it("el bucket rechaza tipos que no sean WebP aunque suba service_role", async () => {
    const path = `agentes/${randomUUID()}/foto.png`;
    const png = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const { error } = await admin.storage
      .from(FOTO_BUCKET)
      .upload(path, png, { contentType: "image/png" });
    if (!error) subidas.push(path);
    expect(error).not.toBeNull();
  });

  it("urlPublicaFoto devuelve null sin foto", () => {
    expect(urlPublicaFoto(null)).toBeNull();
    expect(urlPublicaFoto(undefined)).toBeNull();
  });
});
