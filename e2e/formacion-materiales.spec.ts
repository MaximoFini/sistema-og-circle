import { randomUUID } from "node:crypto";
import { type APIRequestContext, type Browser, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";

// =============================================================================
// VGRP-88 — Materiales adicionales, de punta a punta contra el proyecto real (tabla
// `materiales` + bucket privado `materiales`):
//
// - El admin sube un archivo desde /admin/contenido/materiales (subida directa del
//   navegador a Storage, con URL firmada), lo edita, reemplaza el archivo, lo oculta y lo
//   borra; cada paso queda en la auditoría y Storage no conserva archivos viejos.
// - El usuario con plan lo ve en /formacion y lo descarga con el título como nombre.
// - Reorden, "Ver todos" y la barrera de no-admin.
//
// Toda fila de test lleva el prefijo "[test]" en el título: si la corrida se corta, la
// borra (fila + archivo) test/helpers/cleanup.ts.
// =============================================================================

const PASSWORD = "test-password-1!";
const admin = createTestAdminClient();

const PDF = {
  name: "checklist.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 test"),
};
const DOCX = {
  name: "checklist-v2.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: Buffer.from("PK test docx contenido"),
};

async function loginComo(page: Page, email: string, password: string = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

async function paginaAdmin(browser: Browser) {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await loginComo(page, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);
  return { page, cerrar: () => contexto.close() };
}

async function existeEnStorage(path: string): Promise<boolean> {
  // `list` en vez de `exists`: este último responde 400 ("Bad Request") para un objeto
  // que ya no está, según la versión de storage-js.
  const carpeta = path.slice(0, path.lastIndexOf("/"));
  const nombre = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage
    .from("materiales")
    .list(carpeta, { search: nombre, limit: 10 });
  if (error) throw error;
  return (data ?? []).some((o) => o.name === nombre);
}

async function material(titulo: string) {
  const { data, error } = await admin.from("materiales").select("*").eq("titulo", titulo);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function borrarMaterialesTest(titulos: string[]) {
  if (titulos.length === 0) return;
  const { data } = await admin.from("materiales").select("id, storage_path").in("titulo", titulos);
  if (!data || data.length === 0) return;
  await admin.storage.from("materiales").remove(data.map((m) => m.storage_path));
  await admin
    .from("materiales")
    .delete()
    .in(
      "id",
      data.map((m) => m.id),
    );
}

/** Alta por API (lo mismo que hace el form, sin la UI): autorizar → subir → crear. */
async function crearMaterialPorApi(request: APIRequestContext, titulo: string): Promise<string> {
  const subida = await request.post("/api/admin/contenido/materiales/subida", {
    data: { nombreArchivo: PDF.name, tamanoBytes: PDF.buffer.length },
  });
  expect(subida.status()).toBe(200);
  const { path, signedUrl, contentType } = (await subida.json()) as Record<string, string>;

  const put = await request.put(signedUrl, {
    data: PDF.buffer,
    headers: { "content-type": contentType, "x-upsert": "false" },
  });
  expect(put.ok(), await put.text()).toBe(true);

  const crear = await request.post("/api/admin/contenido/materiales", {
    data: { titulo, descripcion: null, storage_path_pendiente: path },
  });
  expect(crear.status(), await crear.text()).toBe(200);
  return ((await crear.json()) as { id: string }).id;
}

test("ciclo completo: el admin sube, el usuario descarga, el admin reemplaza y oculta, y borra", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  // Tildes, ñ, corchetes y paréntesis a propósito: storage-js codificaba dos veces el nombre
  // de descarga y el archivo bajaba como "Gu%C3%ADa…" (ver urlDescarga).
  const titulo = `[test] Guía de importación (año ${randomUUID().slice(0, 8)})`;
  const usuario = await createAuthenticatedUser("completo");
  const adm = await paginaAdmin(browser);

  try {
    // 1) Alta desde la UI del panel: el archivo sube directo a Storage con progreso.
    await adm.page.goto("/admin/contenido/materiales/nuevo");
    // Hidratado el form: antes, el input todavía no tiene su onChange.
    await adm.page.waitForLoadState("networkidle");
    await adm.page.locator('input[type="file"]').setInputFiles(PDF);
    await expect(adm.page.getByText("listo para guardar")).toBeVisible();
    // El título se sugiere desde el nombre del archivo; se reemplaza por el de test.
    await expect(adm.page.getByLabel("Título *")).toHaveValue("checklist");
    await adm.page.getByLabel("Título *").fill(titulo);
    await adm.page.getByRole("button", { name: "Crear y publicar" }).click();
    await adm.page.waitForURL("**/admin/contenido/materiales");
    await expect(adm.page.getByText(titulo)).toBeVisible();
    await expect(adm.page.getByText(/^Espacio usado: .+ de 1 GB/)).toBeVisible();

    const creado = await material(titulo);
    expect(creado).toMatchObject({
      publicado: true,
      tipo: "pdf",
      extension: "pdf",
      tamano_bytes: PDF.buffer.length,
    });
    expect(creado?.storage_path).toMatch(/^archivos\/[0-9a-f-]{36}\.pdf$/);
    expect(await existeEnStorage(creado?.storage_path as string)).toBe(true);

    // 2) El usuario lo ve en /formacion (sin redeploy) y lo descarga con el título como nombre.
    await loginComo(page, usuario.email);
    await page.goto("/formacion");
    const card = page.getByRole("region", { name: "Materiales adicionales" });
    await expect(card.getByText(titulo, { exact: true })).toBeVisible();
    await expect(card.getByText(`PDF · ${PDF.buffer.length} B`).first()).toBeVisible();

    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      card.getByRole("button", { name: `Descargar ${titulo}` }).click(),
    ]);
    expect(descarga.suggestedFilename()).toBe(`${titulo}.pdf`);

    // 3) El admin reemplaza el archivo por un .docx y lo oculta.
    await adm.page.getByText(titulo).click();
    await adm.page.waitForURL(`**/admin/contenido/materiales/${creado?.id}`);
    await expect(adm.page.getByText(/^Actual: PDF \(\.pdf\)/)).toBeVisible();
    await adm.page.waitForLoadState("networkidle");
    await adm.page.locator('input[type="file"]').setInputFiles(DOCX);
    await expect(adm.page.getByText("listo para guardar")).toBeVisible();
    await adm.page.getByLabel("Publicado (visible en Formación)").uncheck();
    await adm.page.getByRole("button", { name: "Guardar cambios" }).click();
    await adm.page.waitForURL("**/admin/contenido/materiales");
    await expect(adm.page.getByText(/Oculto/).first()).toBeVisible();

    const editado = await material(titulo);
    expect(editado).toMatchObject({
      publicado: false,
      tipo: "word",
      extension: "docx",
      tamano_bytes: DOCX.buffer.length,
      orden: creado?.orden, // conserva el lugar
    });
    expect(editado?.storage_path).not.toBe(creado?.storage_path);
    expect(await existeEnStorage(editado?.storage_path as string)).toBe(true);
    expect(await existeEnStorage(creado?.storage_path as string)).toBe(false);

    // 4) Oculto → desaparece de /formacion sin redeploy.
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Materiales adicionales" }).getByText(titulo),
    ).toHaveCount(0);

    // 5) El admin lo borra (con confirmación): se van la fila y el archivo.
    await adm.page.getByText(titulo).click();
    adm.page.once("dialog", (d) => d.accept());
    await adm.page.getByRole("button", { name: "Borrar" }).click();
    await adm.page.waitForURL("**/admin/contenido/materiales");
    expect(await material(titulo)).toBeNull();
    expect(await existeEnStorage(editado?.storage_path as string)).toBe(false);

    // 6) Cada paso dejó su entrada en la auditoría.
    const { data: auditoria } = await admin
      .from("admin_audit_log")
      .select("accion")
      .eq("entidad", "materiales")
      .eq("entidad_id", creado?.id as string);
    expect((auditoria ?? []).map((a) => a.accion).sort()).toEqual(
      ["borrar_contenido", "crear_contenido", "editar_contenido"].sort(),
    );
  } finally {
    await adm.cerrar();
    await borrarMaterialesTest([titulo]);
    await cleanupUser(usuario.userId);
  }
});

test("el admin rechaza en el navegador un tipo no permitido, sin pedir nada al servidor", async ({
  browser,
}) => {
  const adm = await paginaAdmin(browser);
  try {
    let pidioSubida = false;
    adm.page.on("request", (r) => {
      if (r.url().includes("/materiales/subida")) pidioSubida = true;
    });

    await adm.page.goto("/admin/contenido/materiales/nuevo");
    await adm.page.waitForLoadState("networkidle");
    await adm.page.locator('input[type="file"]').setInputFiles({
      name: "instalador.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });

    await expect(adm.page.getByText(/PDF, PowerPoint, Excel o Word/).last()).toBeVisible();
    await expect(adm.page.getByRole("button", { name: "Crear y publicar" })).toBeDisabled();
    expect(pidioSubida).toBe(false);
  } finally {
    await adm.cerrar();
  }
});

test("reordenar y 'Ver todos': el usuario ve los materiales en el orden del admin, de a 6", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const prefijo = `[test] Orden ${randomUUID().slice(0, 8)}`;
  const titulos = Array.from({ length: 7 }, (_, i) => `${prefijo} ${i + 1}`);
  const usuario = await createAuthenticatedUser("completo");
  const adm = await paginaAdmin(browser);

  try {
    const ids: string[] = [];
    for (const titulo of titulos) ids.push(await crearMaterialPorApi(adm.page.request, titulo));

    // Primeros en la lista (delante de cualquier material real) y con el último arriba de
    // todo: el reorden real del panel reparte los lugares que el grupo ya ocupaba.
    for (const [i, id] of ids.entries()) {
      await admin
        .from("materiales")
        .update({ orden: -1_000_000 + i })
        .eq("id", id);
    }
    const nuevoOrden = [ids[6], ...ids.slice(0, 6)];
    const res = await adm.page.request.put("/api/admin/contenido/materiales/orden", {
      data: { ids: nuevoOrden },
    });
    expect(res.status()).toBe(200);

    await loginComo(page, usuario.email);
    await page.goto("/formacion");
    const card = page.getByRole("region", { name: "Materiales adicionales" });

    // Colapsado: 6 filas y el botón con el total.
    const filas = card.getByRole("listitem");
    await expect(filas).toHaveCount(6);
    await expect(filas.first()).toContainText(titulos[6]);
    const verTodos = card.getByRole("button", { name: /^Ver todos \(\d+\)$/ });
    await expect(verTodos).toBeVisible();

    await verTodos.click();
    expect(await filas.count()).toBeGreaterThanOrEqual(7);
    await expect(card.getByRole("button", { name: "Ver menos" })).toBeVisible();

    const propios = (await filas.allTextContents()).filter((t) => t.includes(prefijo));
    expect(propios.map((t) => titulos.find((x) => t.includes(x)))).toEqual([
      titulos[6],
      ...titulos.slice(0, 6),
    ]);
  } finally {
    await adm.cerrar();
    await borrarMaterialesTest(titulos);
    await cleanupUser(usuario.userId);
  }
});

test("un usuario que no es admin recibe 404 en las rutas de materiales y no sube nada", async ({
  page,
}) => {
  const usuario = await createAuthenticatedUser("completo", "user");
  try {
    await loginComo(page, usuario.email);

    const subida = await page.request.post("/api/admin/contenido/materiales/subida", {
      data: { nombreArchivo: "a.pdf", tamanoBytes: 10 },
    });
    expect(subida.status()).toBe(404);

    const crear = await page.request.post("/api/admin/contenido/materiales", {
      data: { titulo: "[test] intruso", storage_path_pendiente: `pendientes/${randomUUID()}.pdf` },
    });
    expect(crear.status()).toBe(404);

    const orden = await page.request.put("/api/admin/contenido/materiales/orden", {
      data: { ids: [randomUUID()] },
    });
    expect(orden.status()).toBe(404);
  } finally {
    await cleanupUser(usuario.userId);
  }
});
