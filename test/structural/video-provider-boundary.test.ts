// VGRP-50 — ancla el criterio de aceptación de VGRP-29 (comentario de cabecera de
// lib/video/provider.ts): "ningún componente de UI debe importar una URL/SDK de YouTube
// directamente". Test estructural: recorre app/ y components/ con node:fs y falla si
// aparece una URL de youtube.com/ytimg.com fuera de lib/video/provider.ts — se pondría
// rojo si alguien pegara una URL de YouTube a mano en VideoCard.tsx (o cualquier otro
// componente), en vez de pasar por videoProvider.urlEmbed()/urlThumbnail().

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const DIRS_A_REVISAR = ["app", "components"];
const PROVIDER = path.join(ROOT, "lib/video/provider.ts");
const PATRON_YOUTUBE = /(youtube\.com|ytimg\.com)/i;
const EXTENSIONES = new Set([".ts", ".tsx"]);

function archivosRecursivos(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...archivosRecursivos(full));
    } else if (EXTENSIONES.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

describe("frontera de VideoProvider — ninguna URL de YouTube fuera de lib/video/provider.ts", () => {
  const archivos = DIRS_A_REVISAR.flatMap((d) => archivosRecursivos(path.join(ROOT, d)));

  it("hay archivos bajo app/ y components/ para revisar (ancla — si esto falla, revisá el glob)", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it("lib/video/provider.ts SÍ referencia youtube.com/ytimg.com (ancla — si esto falla, el patrón de este test quedó desactualizado respecto al provider real)", () => {
    const content = readFileSync(PROVIDER, "utf8");
    expect(PATRON_YOUTUBE.test(content)).toBe(true);
  });

  it.each(archivos.map((a) => [rel(a), a] as const))(
    "%s no contiene una URL de youtube.com/ytimg.com",
    (_label, archivo) => {
      const content = readFileSync(archivo, "utf8");
      expect(
        PATRON_YOUTUBE.test(content),
        `${rel(archivo)} contiene una referencia a youtube.com/ytimg.com. La única forma correcta de ` +
          "construir una URL de video (embed o thumbnail) es lib/video/provider.ts " +
          "(videoProvider.urlEmbed()/urlThumbnail()) — ver el comentario de cabecera de ese archivo. " +
          "Ningún componente bajo app/ o components/ debe referenciar el dominio de YouTube directo: " +
          "migrar de proveedor (Mux, Fase 4 del roadmap) tiene que ser cambiar UN solo archivo.",
      ).toBe(false);
    },
  );
});
