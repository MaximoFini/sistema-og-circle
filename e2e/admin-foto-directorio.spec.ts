import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { FOTO_BUCKET } from "../lib/fotos/constantes";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";
import "../test/helpers/load-env";

// =============================================================================
// Foto de perfil de agentes (specs/foto-perfil-agentes-profesionales, T14) — de
// punta a punta con browser real: el admin elige una imagen, la encuadra en el
// editor, crea el agente, el usuario ve la foto en Inicio, y el admin la quita.
// También: archivos inválidos rechazados en el cliente y "Cancelar" en el editor
// que conserva la foto anterior.
//
// El agente lleva el prefijo "[test]" (red de contención: cleanupContenidoDeTest,
// que también borra sus objetos del bucket).
// =============================================================================

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!";

async function loginComo(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

async function jpeg(ancho: number, alto: number): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 30, g: 110, b: 220 } },
  })
    .jpeg()
    .toBuffer();
}

test("un admin carga, encuadra y quita la foto de un agente, y el usuario la ve en Inicio", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);

  const nombre = `[test] Agente foto e2e ${randomUUID()}`;
  const usuario = await createAuthenticatedUser("completo");
  const contextoAdmin = await browser.newContext();
  const paginaAdmin = await contextoAdmin.newPage();
  let agenteId: string | null = null;

  try {
    await loginComo(paginaAdmin, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);
    await paginaAdmin.goto("/admin/contenido/agentes/nuevo");
    const inputFoto = paginaAdmin.getByLabel("Elegir foto de perfil");

    // 1) Archivos inválidos: se rechazan en el cliente, sin abrir el editor.
    await inputFoto.setInputFiles({
      name: "foto.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("no soy una imagen"),
    });
    await expect(paginaAdmin.getByText("Formato no permitido. Usá JPG, PNG o WebP.")).toBeVisible();

    await inputFoto.setInputFiles({
      name: "chica.jpg",
      mimeType: "image/jpeg",
      buffer: await jpeg(120, 120),
    });
    await expect(paginaAdmin.getByText(/La imagen es muy chica/)).toBeVisible();
    await expect(paginaAdmin.getByRole("dialog")).toHaveCount(0);

    // 2) Imagen válida: abre el editor, se acerca con el zoom y se confirma.
    await inputFoto.setInputFiles({
      name: "foto.jpg",
      mimeType: "image/jpeg",
      buffer: await jpeg(900, 600),
    });
    const editor = paginaAdmin.getByRole("dialog", { name: "Encuadrá la foto" });
    await expect(editor).toBeVisible();
    await editor.getByRole("slider").fill("2");
    await editor.getByRole("button", { name: "Usar esta foto" }).click();
    await expect(editor).toBeHidden();
    await expect(
      paginaAdmin.getByText("La foto nueva se guarda cuando guardes el ítem."),
    ).toBeVisible();

    // 3) Crear el agente: el registro y después la foto.
    await paginaAdmin.getByLabel(/^Nombre/).fill(nombre);
    await paginaAdmin.getByLabel(/^Especialidad/).fill("Electrónica");
    await paginaAdmin.getByLabel(/^Contacto/).fill("wa.me/0000000000");
    await paginaAdmin.getByRole("button", { name: "Crear" }).click();
    await paginaAdmin.waitForURL("**/admin/contenido/agentes");

    const { data: fila, error } = await admin
      .from("agentes")
      .select("id, foto_path")
      .eq("nombre", nombre)
      .single();
    expect(error).toBeNull();
    agenteId = fila?.id ?? null;
    expect(fila?.foto_path).toMatch(new RegExp(`^agentes/${agenteId}/.+\\.webp$`));

    // 4) El usuario ve la foto (no las iniciales) en la tarjeta del agente.
    await loginComo(page, usuario.email, PASSWORD);
    const tarjeta = page.locator("div", { has: page.getByText(nombre, { exact: true }) }).last();
    const foto = tarjeta.locator("img");
    await foto.scrollIntoViewIfNeeded();
    await expect(foto).toHaveAttribute("src", /fotos-directorio/);
    await expect
      .poll(() => foto.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    // 5) Cancelar el editor conserva la foto guardada.
    await paginaAdmin.goto(`/admin/contenido/agentes/${agenteId}`);
    await paginaAdmin.getByLabel("Elegir foto de perfil").setInputFiles({
      name: "otra.jpg",
      mimeType: "image/jpeg",
      buffer: await jpeg(700, 700),
    });
    await editor.getByRole("button", { name: "Cancelar" }).click();
    await expect(editor).toBeHidden();
    await expect(paginaAdmin.getByRole("button", { name: "Quitar foto" })).toBeVisible();

    // 6) Quitar la foto y guardar: la fila queda sin foto y el objeto se borra.
    const pathAnterior = fila?.foto_path as string;
    await paginaAdmin.getByRole("button", { name: "Quitar foto" }).click();
    await expect(paginaAdmin.getByText("La foto se va a quitar al guardar.")).toBeVisible();
    await paginaAdmin.getByRole("button", { name: "Guardar cambios" }).click();
    await paginaAdmin.waitForURL("**/admin/contenido/agentes");

    const { data: despues } = await admin
      .from("agentes")
      .select("foto_path")
      .eq("id", agenteId as string)
      .single();
    expect(despues?.foto_path).toBeNull();
    const { data: objetos } = await admin.storage
      .from(FOTO_BUCKET)
      .list(pathAnterior.slice(0, pathAnterior.lastIndexOf("/")));
    expect(objetos ?? []).toHaveLength(0);

    // 7) El usuario vuelve a ver las iniciales.
    await page.reload();
    const tarjetaSinFoto = page
      .locator("div", { has: page.getByText(nombre, { exact: true }) })
      .last();
    await expect(tarjetaSinFoto.locator("img")).toHaveCount(0);
  } finally {
    // Si el test venció por timeout, close() tira "Test ended" y esa excepción
    // reemplazaría al error original (el paso donde se trabó) en el reporte.
    await contextoAdmin.close().catch(() => {});
    if (agenteId) {
      const { data } = await admin.storage.from(FOTO_BUCKET).list(`agentes/${agenteId}`);
      const paths = (data ?? []).map((o) => `agentes/${agenteId}/${o.name}`);
      if (paths.length > 0) await admin.storage.from(FOTO_BUCKET).remove(paths);
    }
    await admin.from("agentes").delete().eq("nombre", nombre);
    await cleanupUser(usuario.userId);
  }
});
