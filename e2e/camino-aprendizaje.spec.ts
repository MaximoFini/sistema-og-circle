import { type Browser, expect, type Page, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";

// =============================================================================
// VGRP-53 → VGRP-88 — el camino de aprendizaje, ahora repartido entre dos pantallas:
//
// - /formacion: Stage 1 y Stage 2 con el camino de siempre (VideoGrid/VideoCard, el video
//   se despliega en su fila), SIN tope de videos y SIN tiles de relleno: solo los
//   publicados.
// - Inicio: una tarjeta por stage con el progreso y "Continuar" (→ /formacion?video=<id>,
//   que despliega ese video), más el contador global vistos / publicados.
//
// No hay React Testing Library en este repo — todo es Playwright contra el DOM real.
//
// `videos` es una tabla GLOBAL: los tests que necesitan controlar qué se ve crean sus
// propias filas con un `orden` muy negativo (quedan primeras, delante de cualquier video
// real) a través del panel real (para que se dispare revalidateTag: un insert directo por
// service role deja la lectura cacheada vieja, ver e2e/admin-edita-video-revalida.spec.ts)
// y las borran en un `finally`. Títulos con el prefijo "[test]" (red de contención de
// test/helpers/cleanup.ts).
// =============================================================================

const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser
const REF = "dQw4w9WgXcQ";

async function loginComo(page: Page, email: string, password: string = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

/** Sesión de admin para crear videos por el panel real (dispara revalidateTag). */
async function crearSesionAdminVideos(browser: Browser) {
  const contexto = await browser.newContext();
  const paginaAdmin = await contexto.newPage();
  await loginComo(paginaAdmin, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);

  return {
    async crearVideo(valores: {
      stage: 1 | 2 | 3;
      titulo: string;
      provider_ref?: string | null;
      publicado?: boolean;
      orden?: number;
    }): Promise<string> {
      const res = await paginaAdmin.request.post("/api/admin/contenido/videos", {
        data: {
          stage: valores.stage,
          titulo: valores.titulo,
          descripcion: null,
          provider_ref: valores.provider_ref ?? null,
          orden: valores.orden ?? 0,
          publicado: valores.publicado ?? false,
        },
      });
      if (!res.ok()) {
        throw new Error(`No se pudo crear el video de test: ${res.status()} ${await res.text()}`);
      }
      return ((await res.json()) as { id: string }).id;
    },
    cerrar: () => contexto.close(),
  };
}

type Admin = ReturnType<typeof createTestAdminClient>;

async function borrarVideosTest(admin: Admin, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await admin.from("videos").delete().in("id", ids);
  if (error) throw error;
}

/** Crea `cantidad` videos publicados de un stage, primeros en el orden. */
async function crearVideosPublicados(
  browser: Browser,
  stage: 1 | 2,
  prefijo: string,
  cantidad: number,
): Promise<{ ids: string[]; titulos: string[] }> {
  const sesion = await crearSesionAdminVideos(browser);
  const ids: string[] = [];
  const titulos: string[] = [];
  try {
    for (let i = 0; i < cantidad; i++) {
      const titulo = `[test] ${prefijo} ${i + 1}`;
      ids.push(
        await sesion.crearVideo({
          stage,
          titulo,
          provider_ref: REF,
          publicado: true,
          orden: -1_000_000 + i,
        }),
      );
      titulos.push(titulo);
    }
  } finally {
    await sesion.cerrar();
  }
  return { ids, titulos };
}

test.describe("Contador de formación (VGRP-28 → VGRP-88)", () => {
  test("mientras la primera lectura de progreso no resolvió se ve el skeleton; al resolver queda 'vistos / publicados'", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("completo");
    try {
      // Demora toda Server Action para tener una ventana determinística del skeleton.
      await page.route("**/*", async (route) => {
        const req = route.request();
        if (req.method() === "POST" && req.headers()["next-action"]) {
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        await route.continue();
      });

      await loginComo(page, created.email);

      const skeleton = page.getByRole("status", { name: "Cargando progreso de videos" });
      await expect(skeleton).toBeVisible();
      await expect(page.getByText(/^0 \/ \d+ videos completados$/)).toHaveCount(0);

      await expect(page.getByText(/^\d+ \/ \d+ videos completados$/)).toBeVisible();
      await expect(skeleton).toHaveCount(0);
    } finally {
      await cleanupUser(created.userId);
    }
  });
});

test.describe("Inicio (VGRP-88)", () => {
  test("'Seguimiento de envíos: próximamente' sigue siendo texto estático", async ({ page }) => {
    const created = await createAuthenticatedUser("completo");
    try {
      await loginComo(page, created.email);
      await expect(
        page.getByText("Seguimiento de envíos: próximamente", { exact: true }),
      ).toBeVisible();
    } finally {
      await cleanupUser(created.userId);
    }
  });

  test("los accesos directos son links internos: /formacion y /calculadora, sin target", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("completo");
    try {
      await loginComo(page, created.email);

      const formacion = page.getByRole("link", { name: "Ver toda la formación" });
      await expect(formacion).toHaveAttribute("href", "/formacion");
      const calculadora = page.getByRole("link", { name: "Abrir calculadora" });
      await expect(calculadora).toHaveAttribute("href", "/calculadora");
      await expect(calculadora).not.toHaveAttribute("target", /.*/);
    } finally {
      await cleanupUser(created.userId);
    }
  });

  test("las secciones aparecen en el orden fijo, con las tarjetas de formación primero", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("completo");
    try {
      await loginComo(page, created.email);

      const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
      expect(headings).toEqual([
        "Formación: importaciones",
        "Formación: armá tu tienda",
        "Todos los videos y materiales",
        "Calculadora de costos",
        "Agentes de compra en China",
        "Hablá con otros importadores",
        "Profesionales al servicio",
        "Servicios financieros",
      ]);
    } finally {
      await cleanupUser(created.userId);
    }
  });

  test("US-4 — la tarjeta propone el PRIMER video sin ver y 'Continuar' abre /formacion con ese video desplegado", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    let ids: string[] = [];
    try {
      const creados = await crearVideosPublicados(browser, 2, "continuar", 3);
      ids = creados.ids;

      // Ya vio el 1 y el 3: el próximo tiene que ser el 2 (el primero sin ver).
      const { error } = await admin
        .from("profiles")
        .update({ progreso: { videosVistos: [creados.ids[0], creados.ids[2]] } })
        .eq("id", created.userId);
      expect(error).toBeNull();

      await loginComo(page, created.email);

      const tarjeta = page.getByRole("region", { name: "Formación: armá tu tienda" });
      await expect(tarjeta.getByText("Próximo video")).toBeVisible();
      await expect(tarjeta.getByText(creados.titulos[1], { exact: true })).toBeVisible();

      const continuar = tarjeta.getByRole("link", { name: "Continuar" });
      await expect(continuar).toHaveAttribute("href", `/formacion?video=${creados.ids[1]}`);
      await continuar.click();

      await page.waitForURL("**/formacion**");
      // El video quedó desplegado (iframe con su título) sin tocar nada más...
      await expect(page.getByTitle(creados.titulos[1])).toBeVisible();
      // ...y la URL quedó limpia: un refresh no lo vuelve a desplegar.
      await expect.poll(() => new URL(page.url()).search).toBe("");
    } finally {
      await borrarVideosTest(admin, ids);
      await cleanupUser(created.userId);
    }
  });

  test("US-4 — con todos los videos publicados del stage vistos, la tarjeta dice 'Completado' y ofrece 'Ver de nuevo'", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    try {
      // Todos los publicados de Stage 1 (los reales de la base, sean cuantos sean).
      const { data, error } = await admin
        .from("videos")
        .select("id")
        .eq("stage", 1)
        .eq("publicado", true)
        .not("provider_ref", "is", null);
      expect(error).toBeNull();
      test.skip((data ?? []).length === 0, "Stage 1 todavía no tiene videos publicados");

      await admin
        .from("profiles")
        .update({ progreso: { videosVistos: (data ?? []).map((v) => v.id) } })
        .eq("id", created.userId);

      await loginComo(page, created.email);

      const tarjeta = page.getByRole("region", { name: "Formación: importaciones" });
      await expect(tarjeta.getByText("Completado", { exact: true })).toBeVisible();
      await expect(tarjeta.getByRole("link", { name: "Ver de nuevo" })).toHaveAttribute(
        "href",
        "/formacion",
      );
      await expect(tarjeta.getByRole("link", { name: "Continuar" })).toHaveCount(0);
    } finally {
      await cleanupUser(created.userId);
    }
  });
});

test.describe("/formacion — camino de aprendizaje (VideoCard/VideoGrid)", () => {
  test("US-2 — sin tope: 15 videos publicados de Stage 2 se ven los 15, en orden", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    let ids: string[] = [];
    try {
      const creados = await crearVideosPublicados(browser, 2, "sin tope", 15);
      ids = creados.ids;

      await loginComo(page, created.email);
      await page.goto("/formacion");

      const stage2 = page.getByRole("region", { name: "Formación: armá tu tienda" });
      // Los 15 aparecen primeros y en el orden del admin.
      // `toHaveText` con arreglo reintenta hasta que estén los 15 (allTextContents no espera).
      await expect(stage2.getByText(/^\[test\] sin tope \d+$/)).toHaveText(creados.titulos);
    } finally {
      await borrarVideosTest(admin, ids);
      await cleanupUser(created.userId);
    }
  });

  test("un video NO publicado no aparece (ya no hay tiles 'Próximamente')", async ({
    page,
    browser,
  }) => {
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    const ids: string[] = [];
    try {
      const sesion = await crearSesionAdminVideos(browser);
      const titulo = "[test] no publicado";
      ids.push(await sesion.crearVideo({ stage: 2, titulo, publicado: false, orden: -1_000_000 }));
      await sesion.cerrar();

      await loginComo(page, created.email);
      await page.goto("/formacion");

      await expect(page.getByRole("heading", { level: 1, name: "Formación" })).toBeVisible();
      await expect(page.getByText(titulo, { exact: true })).toHaveCount(0);
    } finally {
      await borrarVideosTest(admin, ids);
      await cleanupUser(created.userId);
    }
  });

  test("marcar como visto en cualquier orden funciona (no hay bloqueo secuencial) y el botón queda en 'Visto'", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    let ids: string[] = [];
    try {
      const creados = await crearVideosPublicados(browser, 2, "camino", 3);
      ids = creados.ids;

      await loginComo(page, created.email);
      await page.goto("/formacion");

      const stage2 = page.getByRole("region", { name: "Formación: armá tu tienda" });
      // Los 3 de test son las 3 primeras filas del stage: los botones 0..2 son los suyos.
      const pendientes = stage2.getByRole("button", { name: "Marcar como visto" });
      await expect(pendientes.nth(2)).toBeVisible();
      const antes = await pendientes.count();

      // Marca el tercero sin tocar los dos primeros.
      await pendientes.nth(2).click();

      await expect(stage2.getByRole("button", { name: "Visto", exact: true })).toHaveCount(1);
      await expect(stage2.getByRole("button", { name: "Visto", exact: true })).toBeDisabled();
      await expect(pendientes).toHaveCount(antes - 1);
      await expect(pendientes.nth(0)).toBeEnabled();
      await expect(pendientes.nth(1)).toBeEnabled();
    } finally {
      await borrarVideosTest(admin, ids);
      await cleanupUser(created.userId);
    }
  });

  test("tocar la miniatura despliega el iframe en la misma fila (no hay modal)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    let ids: string[] = [];
    try {
      const creados = await crearVideosPublicados(browser, 1, "expandir", 1);
      ids = creados.ids;
      const [titulo] = creados.titulos;

      await loginComo(page, created.email);
      await page.goto("/formacion");

      const stage1 = page.getByRole("region", { name: "Formación: importaciones" });
      await expect(stage1.getByTitle(titulo)).toHaveCount(0);
      await stage1.getByRole("button", { name: `Reproducir ${titulo}` }).click();
      await expect(stage1.getByTitle(titulo)).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await borrarVideosTest(admin, ids);
      await cleanupUser(created.userId);
    }
  });

  test("un ?video= que no existe muestra la página normal, sin desplegar nada", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("completo");
    try {
      await loginComo(page, created.email);
      await page.goto("/formacion?video=00000000-0000-0000-0000-000000000000");

      await expect(page.getByRole("heading", { level: 1, name: "Formación" })).toBeVisible();
      await expect(page.locator("iframe")).toHaveCount(0);
    } finally {
      await cleanupUser(created.userId);
    }
  });

  test("el admin reordena arrastrando en /formacion (teclado) y el orden persiste", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const admin = createTestAdminClient();
    let ids: string[] = [];
    try {
      const creados = await crearVideosPublicados(browser, 2, "reorden", 2);
      ids = creados.ids;

      await loginComo(page, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);
      await page.goto("/formacion");
      // Sin hidratar, dnd-kit todavía no escucha el teclado.
      await page.waitForLoadState("networkidle");

      // Mismo sensor que el mouse en dnd-kit: levantar el 2.º y subirlo un lugar. Cada
      // tecla necesita que dnd-kit termine de medir y renderizar el paso anterior; sin la
      // pausa el ArrowUp llega antes de que arranque el arrastre y se suelta en el mismo lugar.
      const agarre = page.getByRole("button", { name: `Mover "${creados.titulos[1]}"` });
      await agarre.focus();
      await page.keyboard.press("Space");
      await page.waitForTimeout(300);
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(300);
      await page.keyboard.press("Space");

      await expect
        .poll(async () => {
          const { data } = await admin.from("videos").select("id, orden").in("id", ids);
          const orden = new Map((data ?? []).map((v) => [v.id, v.orden]));
          return (orden.get(ids[1]) ?? 0) < (orden.get(ids[0]) ?? 0);
        })
        .toBe(true);
    } finally {
      await borrarVideosTest(admin, ids);
    }
  });
});

test.describe("Agentes: video explicativo (stage 3)", () => {
  test("un video de stage 3 NO publicado no aparece en Inicio", async ({ page, browser }) => {
    const created = await createAuthenticatedUser("completo");
    const admin = createTestAdminClient();
    const ids: string[] = [];
    try {
      const sesion = await crearSesionAdminVideos(browser);
      const titulo = "[test] stage3 no publicado";
      ids.push(await sesion.crearVideo({ stage: 3, titulo, publicado: false, orden: -1_000_000 }));
      await sesion.cerrar();

      await loginComo(page, created.email);

      const seccion = page.getByRole("region", { name: "Agentes de compra en China" });
      await expect(seccion).toBeVisible();
      await expect(seccion.getByText(titulo, { exact: true })).toHaveCount(0);
    } finally {
      await borrarVideosTest(admin, ids);
      await cleanupUser(created.userId);
    }
  });
});
