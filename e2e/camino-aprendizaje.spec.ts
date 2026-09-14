import { expect, type Page, test } from "@playwright/test";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-53 — cierra en tests el resto del Bloque 8: VGRP-28 (stats con skeleton
// explícito), VGRP-31 (banner calculadora + video explicativo Stage 3), y el
// rediseño "camino de aprendizaje" de VideoCard/VideoGrid (commit c2b851f, sin
// ticket propio) que hasta este ticket no tenía un solo test.
//
// No hay React Testing Library en este repo (ver CLAUDE.md/instrucciones del
// ticket) — todo lo de acá es Playwright contra el DOM real, mismo patrón de
// login que e2e/dashboard-shell.spec.ts (loginComo, createAuthenticatedUser,
// cleanupUser).
//
// `videos` es una tabla GLOBAL (no por usuario) leída por
// `obtenerVideosPorStage` (lib/data/videos.ts): cada stage siempre muestra
// como máximo `CANTIDAD_STAGE[stage]` filas, ordenadas por `orden` ascendente.
// Los tests que necesitan controlar exactamente qué se ve insertan sus propias
// filas con un `orden` muy negativo (garantiza que ordenan primero que
// cualquier fila real que ya exista) y las borran en un `finally` — mismo
// criterio de limpieza obligatoria que docs/TESTING.md exige para todo dato
// de test contra el proyecto real. Cuando un test depende de que un stage no
// tenga NINGUNA fila real todavía (para ver el tile de relleno sintético,
// `video.id === null`), se documenta esa suposición en el test mismo — es el
// mismo supuesto que ya usa el `it` "stage 3 sin filas reales..." de
// lib/data/videos.test.ts, no algo nuevo de este archivo.
// =============================================================================

const PASSWORD = "test-password-1!"; // default de createAuthenticatedUser

async function loginComo(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

type Admin = ReturnType<typeof createTestAdminClient>;

async function crearVideoTest(
  admin: Admin,
  valores: {
    stage: 1 | 2 | 3;
    titulo: string;
    provider_ref?: string | null;
    publicado?: boolean;
    orden?: number;
  },
) {
  const { data, error } = await admin
    .from("videos")
    .insert({
      stage: valores.stage,
      titulo: valores.titulo,
      descripcion: null,
      provider_ref: valores.provider_ref ?? null,
      publicado: valores.publicado ?? false,
      orden: valores.orden ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function borrarVideosTest(admin: Admin, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await admin.from("videos").delete().in("id", ids);
  if (error) throw error;
}

test.describe("StatsVideos — skeleton explícito durante la carga (VGRP-28)", () => {
  test("mientras la primera lectura de progreso no resolvió se ve el skeleton (role=status), NUNCA '0 / 11'; al resolver, el skeleton desaparece y queda 'vistos / 11 videos completados'", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    try {
      // Retrasa a propósito toda Server Action (`obtenerProgresoVideos`, VGRP-29 incluido)
      // para tener una ventana determinística donde observar el skeleton — sin este
      // intercept, la resolución real contra Supabase puede ser demasiado rápida para
      // capturarla de forma confiable en un test.
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
      // Mientras está el skeleton, el contador final nunca convive en pantalla con "0 / 11"
      // literal — sería indistinguible de un usuario que de verdad tiene 0 vistos.
      await expect(page.getByText("0 / 11 videos completados")).toHaveCount(0);

      // Resuelve (el intercept de arriba sólo demora, no bloquea) y el skeleton se
      // reemplaza por el contador real, mismo <p>/tamaño sin salto de layout.
      await expect(page.getByText(/^\d+ \/ 11 videos completados$/)).toBeVisible();
      await expect(skeleton).toHaveCount(0);
    } finally {
      await cleanupUser(created.userId);
    }
  });
});

test.describe("Texto estático de envíos (VGRP-28)", () => {
  test("'Seguimiento de envíos: próximamente' es texto estático fijo — Fase 2 no tiene módulo de envíos; si alguien lo reemplaza por un contador real este test se rompe", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, created.email);
      await expect(
        page.getByText("Seguimiento de envíos: próximamente", { exact: true }),
      ).toBeVisible();
    } finally {
      await cleanupUser(created.userId);
    }
  });
});

test.describe("Banner calculadora (VGRP-31)", () => {
  test("el CTA 'Abrir calculadora' usa links.calculadora de getLinks() (no un string hardcodeado en el componente) y abre en pestaña nueva de forma segura (target=_blank + rel=noopener noreferrer)", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, created.email);

      const link = page.getByRole("link", { name: "Abrir calculadora" });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      // Este entorno no tiene un store de Edge Config vinculado (VGRP-39, ver
      // docs/TESTING.md), así que getLinks() cae al default hardcodeado en
      // lib/config/index.ts (DEFAULT_LINKS.calculadora) — es el valor exacto que
      // TextLink debería recibir de `links.calculadora`, nunca un placeholder distinto
      // escrito a mano en InicioShell.
      await expect(link).toHaveAttribute("href", "https://vegroup.vercel.app/calculadora");
    } finally {
      await cleanupUser(created.userId);
    }
  });
});

test.describe("Orden de secciones de InicioShell (MODULOS.md §2)", () => {
  test("las secciones aparecen en el DOM en el orden fijo: Stage 1 → calculadora → Stage 2 → agentes → comunidad → profesionales → servicios financieros", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, created.email);

      const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
      expect(headings).toEqual([
        "Formación: importaciones",
        "Calculadora de costos",
        "Formación: armá tu tienda",
        "Agentes de compra en China",
        "Hablá con otros importadores",
        "Profesionales al servicio",
        "Servicios financieros",
      ]);
    } finally {
      await cleanupUser(created.userId);
    }
  });
});

test.describe("Camino de aprendizaje — VideoCard/VideoGrid (VGRP-53, hueco total de tests)", () => {
  test("nodo 'disponible' es interactuable sin importar el orden (NO hay bloqueo secuencial real): marcar como visto el paso 3 sin haber tocado los pasos 1 y 2 funciona igual, y el botón nunca desaparece (queda disabled diciendo 'Visto')", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    const admin = createTestAdminClient();
    const idsCreados: string[] = [];
    try {
      // Stage 2 = 3 tiles siempre (CANTIDAD_STAGE[2]). Estas 3 filas, con orden muy
      // negativo, ocupan las 3 posiciones visibles completas — no queda lugar para
      // ninguna fila real preexistente ni para un tile de relleno sintético.
      const v1 = await crearVideoTest(admin, {
        stage: 2,
        titulo: "VGRP-53 camino v1",
        provider_ref: "dQw4w9WgXcQ",
        publicado: true,
        orden: -3,
      });
      const v2 = await crearVideoTest(admin, {
        stage: 2,
        titulo: "VGRP-53 camino v2",
        provider_ref: "dQw4w9WgXcQ",
        publicado: true,
        orden: -2,
      });
      const v3 = await crearVideoTest(admin, {
        stage: 2,
        titulo: "VGRP-53 camino v3",
        provider_ref: "dQw4w9WgXcQ",
        publicado: true,
        orden: -1,
      });
      idsCreados.push(v1.id, v2.id, v3.id);

      await loginComo(page, created.email);

      const seccion = page.getByRole("region", { name: "Formación: armá tu tienda" });

      // Estado inicial: las 3 filas están "disponible" (ninguna vista todavía) — 3
      // botones "Marcar como visto", ninguno disabled.
      const botonesPendientes = seccion.getByRole("button", { name: "Marcar como visto" });
      await expect(botonesPendientes).toHaveCount(3);

      // Marca el paso 3 (índice 2, el último en orden) sin tocar los pasos 1 y 2.
      await botonesPendientes.nth(2).click();

      // El paso 3 pasó a "Visto" (disabled) — nunca desaparece el botón.
      const botonVistoV3 = seccion.getByRole("button", { name: "Visto" });
      await expect(botonVistoV3).toHaveCount(1);
      await expect(botonVistoV3).toBeDisabled();

      // Los pasos 1 y 2 SIGUEN "disponible" (no vistos, botón habilitado) — ninguno
      // quedó bloqueado por el hecho de que el paso 3 se marcó primero.
      await expect(seccion.getByRole("button", { name: "Marcar como visto" })).toHaveCount(2);

      // El nodo circular del paso 3 muestra el check de completado.
      await expect(seccion.getByText("✓", { exact: true })).toHaveCount(1);
    } finally {
      await borrarVideosTest(admin, idsCreados);
      await cleanupUser(created.userId);
    }
  });

  test("expandir (thumbnail → iframe) sólo pasa con disponible && embedUrl: clickear 'Reproducir' muestra el iframe con el título del video, ausente antes del click", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    const admin = createTestAdminClient();
    const idsCreados: string[] = [];
    try {
      const titulo = "VGRP-53 expandir test";
      const v1 = await crearVideoTest(admin, {
        stage: 2,
        titulo,
        provider_ref: "dQw4w9WgXcQ",
        publicado: true,
        orden: -10,
      });
      // Completa el resto del stage para no depender de si hay filas reales de más.
      const v2 = await crearVideoTest(admin, { stage: 2, titulo: "VGRP-53 relleno a", orden: -9 });
      const v3 = await crearVideoTest(admin, { stage: 2, titulo: "VGRP-53 relleno b", orden: -8 });
      idsCreados.push(v1.id, v2.id, v3.id);

      await loginComo(page, created.email);

      const seccion = page.getByRole("region", { name: "Formación: armá tu tienda" });
      await expect(seccion.getByTitle(titulo)).toHaveCount(0);

      await seccion.getByRole("button", { name: `Reproducir ${titulo}` }).click();

      await expect(seccion.getByTitle(titulo)).toBeVisible();
    } finally {
      await borrarVideosTest(admin, idsCreados);
      await cleanupUser(created.userId);
    }
  });

  test("una fila real NO publicada (video.id presente, estado='proximamente') muestra su propio título junto al badge 'Próximamente' — dos textos distintos, no es un tile de relleno", async ({
    page,
  }) => {
    const created = await createAuthenticatedUser("principiante");
    const admin = createTestAdminClient();
    const idsCreados: string[] = [];
    try {
      const titulo = "VGRP-53 stage3 no publicado";
      // orden muy negativo: CANTIDAD_STAGE[3] = 1, así que esta fila SIEMPRE es la que
      // ocupa el único slot visible, sin importar qué otra fila real exista para stage 3.
      const v = await crearVideoTest(admin, {
        stage: 3,
        titulo,
        publicado: false,
        orden: -1_000_000,
      });
      idsCreados.push(v.id);

      await loginComo(page, created.email);

      const seccion = page.getByRole("region", { name: "Agentes de compra en China" });
      await expect(seccion.getByText(titulo, { exact: true })).toBeVisible();
      await expect(seccion.getByText("Próximamente", { exact: true })).toBeVisible();
      // No es interactuable: sin id publicado no hay ni thumbnail ni botón de marcar.
      await expect(seccion.getByRole("button", { name: "Marcar como visto" })).toHaveCount(0);
      await expect(seccion.getByRole("button", { name: /^Reproducir/ })).toHaveCount(0);
    } finally {
      await borrarVideosTest(admin, idsCreados);
      await cleanupUser(created.userId);
    }
  });

  test("caso borde — path de un solo tile (Stage 3, CANTIDAD_STAGE[3]=1): el tile de relleno (video.id===null) muestra sólo 'Próximamente' sin duplicar título, no es clickeable, y VideoGrid con un array de 1 elemento no deja una línea conectora (.linea) colgando", async ({
    page,
  }) => {
    // SUPUESTO EXPLÍCITO (documentado, mismo criterio que lib/data/videos.test.ts, "stage 3
    // sin filas reales..."): este test NO crea ninguna fila para stage 3 y asume que hoy no
    // hay ninguna fila real ya publicada en la base para ese stage — si en algún momento se
    // carga contenido real de stage 3 en el proyecto compartido, este test empieza a ver esa
    // fila real en vez del tile de relleno y hay que revisarlo (no es un fallo silencioso:
    // el primer assert de abajo, "Próximamente" único, ya lo expondría en rojo).
    const created = await createAuthenticatedUser("principiante");
    try {
      await loginComo(page, created.email);

      const seccion = page.getByRole("region", { name: "Agentes de compra en China" });

      // Sólo UN "Próximamente" (el propio tituloPaso del tile de relleno) — una fila real
      // no publicada mostraría el título Y el badge por separado (ver el test de arriba),
      // acá deben ser el mismo único texto.
      await expect(seccion.getByText("Próximamente", { exact: true })).toHaveCount(1);
      await expect(seccion.getByRole("button", { name: "Marcar como visto" })).toHaveCount(0);
      await expect(seccion.getByRole("button", { name: /^Reproducir/ })).toHaveCount(0);

      // Estructural: el nodo circular (numero "1", aria-hidden) es HIJO ÚNICO de su
      // contenedor (.riel) — si VideoGrid dejara una <div className={styles.linea}>
      // colgando para el único elemento (esUltimo debería ser true), habría un segundo
      // hijo ahí.
      const nodo = seccion.locator('[aria-hidden="true"]', { hasText: "1" }).first();
      await expect(nodo).toBeVisible();
      const hijosDelRiel = await nodo.evaluate((el) => el.parentElement?.children.length ?? -1);
      expect(hijosDelRiel).toBe(1);
    } finally {
      await cleanupUser(created.userId);
    }
  });
});
