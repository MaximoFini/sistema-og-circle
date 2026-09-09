import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { insertarPago, proyectarNivel } from "../lib/data/pagos";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-48 §1 — E2E: pago aprobado → acceso activado (el recorrido del dinero).
//
// Adelantado desde VGRP-42 (Bloque 8): esperar al final del proyecto para
// probar el camino del dinero es justo lo que este bloque existe para evitar.
//
// -----------------------------------------------------------------------------
// LÍMITE DE ENTORNO — cómo se llega al estado "pago approved", y por qué
// -----------------------------------------------------------------------------
// El ticket pide "stubbear la API de Mercado Pago" para el paso del webhook.
// Eso es directo en un test unitario/de integración (vi.mock reemplaza el
// módulo DENTRO del mismo proceso de Node que corre el test — ver
// `test/integration/webhook-mercadopago.test.ts`, que SÍ ejercita el Route
// Handler real, con firma HMAC real, mockeando sólo `getPaymentClient()`).
//
// Acá NO es posible: Playwright levanta el server con `pnpm build && pnpm
// start` como un proceso de Node HIJO y completamente separado (ver
// `playwright.config.ts`) — no hay forma de inyectarle un `vi.mock` a ese
// proceso desde este archivo. La única forma honesta de que ESE proceso vea
// un pago "approved" real sería crear un pago de verdad contra el sandbox de
// Mercado Pago (tokenizando una tarjeta de prueba vía la API pública de MP),
// lo cual agrega infraestructura de test nueva (tokenización de tarjeta,
// manejo de la Public Key) fuera del alcance de este ticket — queda anotado
// como mejora futura, no simulado acá con un resultado inventado.
//
// Lo que SÍ se prueba de punta a punta, con navegador real y sin atajos:
//
//   1. El checkout es REAL: se click-ea "Comprar nivel principiante" en
//      `/comprar` con un usuario logueado real, y el Server Action
//      `crearCheckout` arma una preferencia de verdad contra el sandbox de
//      Mercado Pago (con las credenciales de prueba reales del proyecto) y
//      el botón navega a un checkout de mercadopago.com real. Este es
//      exactamente el criterio del ticket: "que se arma la preferencia... y
//      que el botón navega" — lo que pasa DESPUÉS en la UI de Mercado Pago
//      (un tercero) no se automatiza.
//   2. La proyección del pago → nivel (lo que en producción dispara el
//      webhook real) se simula llamando a `insertarPago`/`proyectarNivel` —
//      las mismas dos funciones de producción que usa
//      `app/api/webhooks/mercadopago/route.ts`, no un `UPDATE` directo a
//      `profiles.nivel` con service role. La corrección del webhook HTTP en
//      sí (firma, idempotencia, no confiar en el body) ya está cubierta
//      contra Postgres real en `test/integration/webhook-mercadopago.test.ts`
//      — lo que este E2E prueba, y que NINGÚN otro test toca, es el
//      polling/refresh del LADO DEL BROWSER en `/comprar/pendiente`.
//   3. Ese polling real (`PendienteClient.tsx`: `refreshSession()` +
//      `consultarNivelActual()` cada 2.5s) detecta el cambio y redirige solo
//      a `/dashboard` con el nivel nuevo — sin que el usuario haga nada, sin
//      recargar la página a mano.
// =============================================================================

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("pago aprobado → acceso activado", () => {
  let userId: string | null = null;

  test.afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  test("el checkout arma una preferencia real y navega a Mercado Pago", async ({ page }) => {
    // -------------------------------------------------------------------
    // HALLAZGO EMPÍRICO — mismo tipo de límite de entorno que ya documenta
    // `e2e/registro-login-dashboard.spec.ts` para /registro, verificado a
    // mano antes de marcar este test como skip.
    // -------------------------------------------------------------------
    // `app/(app)/comprar/page.tsx` es un Server Component sin `dynamic =
    // "force-dynamic"`, así que Next lo PRERENDERIZA ESTÁTICO en build time
    // (confirmado en el output de `pnpm build`: `/comprar` sale marcada `○`,
    // no `ƒ`). `getPrecios()` corre UNA VEZ en ese momento — y como este
    // entorno no tiene un store de Edge Config vinculado (VGRP-39, mismo
    // hallazgo que ya documenta `docs/EDGE-CONFIG.md`), esa llamada falla
    // (fail-closed) y el resultado ("Checkout no disponible", sin botones de
    // compra) queda HORNEADO en el HTML estático del build — no hay ningún
    // camino de UI real que pueda ver los botones de compra en este build,
    // sin importar qué credenciales de Mercado Pago haya en `.env.local`.
    //
    // Confirmado navegando a /comprar con Playwright real contra este mismo
    // build: renderiza el card de error, cero botones de nivel montados.
    test.skip(
      true,
      "app/(app)/comprar/page.tsx se prerenderiza estático en build time y getPrecios() falla " +
        "sin un store de Edge Config vinculado (VGRP-39) — el resultado queda horneado en el " +
        "HTML del build, así que ningún test contra este build puede ver los botones de compra " +
        "reales. Cuando exista el store (o el equipo decida agregar `dynamic = 'force-dynamic'` " +
        "a esa página), reemplazar este skip por el flujo real de abajo.",
    );

    const creado = await createAuthenticatedUser("ninguno");
    userId = creado.userId;
    const PASSWORD = "test-password-1!";

    await login(page, creado.email, PASSWORD);

    await page.goto("/comprar");
    await page.getByRole("button", { name: "Comprar nivel principiante" }).click();

    // Navegación de salida real: `ComprarButton` hace
    // `window.location.assign(result.url)` recién cuando `crearCheckout`
    // devolvió `ok:true` con una preferencia real de MP — si algo del lado
    // de nuestro Server Action fallara (credenciales, Edge Config caído),
    // esto nunca navega y el `waitForURL` de abajo hace timeout.
    await page.waitForURL(/mercadopago\.com/, { timeout: 15_000 });
  });

  test("la pantalla de espera desbloquea sola cuando el pago se proyecta, sin recargar a mano", async ({
    page,
  }) => {
    const creado = await createAuthenticatedUser("ninguno");
    userId = creado.userId;
    const PASSWORD = "test-password-1!";
    const admin = createTestAdminClient();

    await login(page, creado.email, PASSWORD);

    // Llegar a `/comprar/pendiente` es parte del recorrido real: es
    // exactamente la URL a la que `armarBackUrls()` (lib/mercadopago/
    // preferencia.ts) manda tanto el `success` como el `pending` de MP —
    // navegar acá a mano reproduce fielmente dónde un usuario real aterriza
    // después de pagar, sin necesitar completar el checkout externo. (No se
    // llama a `armarPreferencia()` desde este archivo: arrastra
    // `import "server-only"`, que explota fuera del runtime de Next —
    // Playwright no tiene el alias que sí usa vitest.config.ts para esto.)
    await page.goto("/comprar/pendiente?nivel=principiante");

    await expect(page.getByText("Estamos confirmando tu pago")).toBeVisible();
    await expect(page.getByText(/Tu compra del nivel/)).toBeVisible();

    // Ver el comentario grande al inicio del archivo: esto reemplaza al
    // webhook real de Mercado Pago (que este entorno no puede disparar de
    // punta a punta sin infra de tokenización de tarjeta) llamando a las
    // MISMAS DOS funciones de producción que usa
    // `app/api/webhooks/mercadopago/route.ts` — nunca un `UPDATE` directo a
    // `profiles.nivel`.
    const proveedorRef = `e2e-pago-${randomUUID()}`;
    const insertado = await insertarPago(admin, {
      userId: creado.userId,
      proveedorRef,
      nivelComprado: "principiante",
      montoArs: 75000,
      estado: "approved",
      payloadRaw: { id: proveedorRef, status: "approved" },
    });
    if (!insertado.inserted) throw new Error("no se pudo sembrar el pago aprobado");
    await proyectarNivel(admin, creado.userId);

    // El polling real del browser (refreshSession + consultarNivelActual,
    // cada 2.5s) tiene que detectar esto solo y redirigir — sin que el test
    // recargue la página ni navegue a mano (eso probaría otra cosa distinta
    // de lo que hace un usuario real, ver el comentario de PendienteClient.tsx).
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    // VGRP-27 reemplazó el placeholder "Tenés acceso {nivel}" (VGRP-18) por
    // el shell real (variante prerenderizada por nivel, vía rewrite de
    // middleware.ts) — el heading que confirma el nivel activo ahora es este.
    await expect(page.getByRole("heading", { name: "Nivel principiante" })).toBeVisible();
  });

  test("pago rejected: la pantalla de pendiente no desbloquea nada (no hay loop infinito ni acceso falso)", async ({
    page,
  }) => {
    const creado = await createAuthenticatedUser("ninguno");
    userId = creado.userId;
    const PASSWORD = "test-password-1!";
    const admin = createTestAdminClient();

    await login(page, creado.email, PASSWORD);
    await page.goto("/comprar/pendiente?nivel=principiante");
    await expect(page.getByText("Estamos confirmando tu pago")).toBeVisible();

    const proveedorRef = `e2e-pago-rechazado-${randomUUID()}`;
    const insertado = await insertarPago(admin, {
      userId: creado.userId,
      proveedorRef,
      nivelComprado: "principiante",
      montoArs: 75000,
      estado: "rejected",
      payloadRaw: { id: proveedorRef, status: "rejected" },
    });
    if (!insertado.inserted) throw new Error("no se pudo sembrar el pago rechazado");
    // A propósito, NO se llama a `proyectarNivel`: un pago `rejected` nunca
    // dispara la proyección en el webhook real (ver route.ts, sólo
    // `estadoInterno === "approved"` o `"refunded"` la disparan).

    // Se espera unos cuantos ciclos de polling (2.5s cada uno) sin llegar al
    // TIMEOUT_MS real de la pantalla (2 minutos) — esperar los 2 minutos
    // completos en cada corrida de esta suite sería impracticable. Lo que
    // importa para este test es la propiedad de seguridad real: NUNCA
    // navega a /dashboard con un pago rechazado, no el mensaje exacto que
    // aparece recién a los 2 minutos.
    await page.waitForTimeout(4 * 2500);
    expect(page.url()).toContain("/comprar/pendiente");
    await expect(page.getByText("Estamos confirmando tu pago")).toBeVisible();

    // El mensaje real de timeout ("Esto está tardando más de lo normal") con
    // el link de WhatsApp recién aparece a los 2 minutos (TIMEOUT_MS en
    // PendienteClient.tsx) — no se prueba acá para no alargar la suite;
    // queda documentado como límite conocido, no como cobertura fingida.
    test.info().annotations.push({
      type: "límite conocido",
      description:
        "el mensaje de timeout de PendienteClient.tsx (a los 2 minutos) no se ejercita en " +
        "esta suite por costo de tiempo — la propiedad probada es la que importa: nunca " +
        "desbloquea con un pago rejected.",
    });
  });
});
