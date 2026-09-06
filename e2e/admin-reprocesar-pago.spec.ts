import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { insertarPago } from "../lib/data/pagos";
import { createAuthenticatedUser } from "../test/helpers/auth";
import { cleanupUser } from "../test/helpers/cleanup";
import { createTestAdminClient } from "../test/helpers/db-client";
import { SEED_ADMIN_USER } from "../test/helpers/seed-users";
import "../test/helpers/load-env";

// =============================================================================
// VGRP-37 (37-T12) — ledger de pagos + reproceso, con UI real.
//
// Se siembra un pago `approved` con el nivel SIN APLICAR (insert directo por
// service role, sin proyectar). El admin abre `/admin/pagos`, ve el badge "sin
// aplicar", entra al detalle, reprocesa, y el nivel del usuario sube (el badge
// deja de aparecer).
//
// El usuario objetivo se crea ad hoc y se limpia al final — no se toca ningún
// usuario del seed.
// =============================================================================

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard");
}

test("el admin reprocesa un pago aprobado sin aplicar y el nivel del usuario sube", async ({
  page,
}) => {
  const objetivo = await createAuthenticatedUser("ninguno");
  const admin = createTestAdminClient();
  const ref = `e2e-ref-${randomUUID()}`;

  const ins = await insertarPago(admin, {
    userId: objetivo.userId,
    proveedorRef: ref,
    nivelComprado: "avanzado",
    montoArs: 5000,
    estado: "approved",
    payloadRaw: { id: 1, status: "approved" },
  });
  if (!ins.inserted) throw new Error("no se pudo sembrar el pago de prueba");

  try {
    await login(page, SEED_ADMIN_USER.email, SEED_ADMIN_USER.password);

    await page.goto(`/admin/pagos?ref=${encodeURIComponent(ref)}`);
    const fila = page.getByRole("link", { name: new RegExp(objetivo.email) });
    await expect(fila).toContainText("sin aplicar");
    await fila.click();

    await page.waitForURL(`**/admin/pagos/${ins.pago.id}`);
    await page.getByRole("button", { name: "Reprocesar pago" }).click();
    await expect(page.getByText(/Reproceso aplicado: ninguno → avanzado/)).toBeVisible();

    const { data: perfil } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", objetivo.userId)
      .single();
    expect(perfil?.nivel).toBe("avanzado");
  } finally {
    await cleanupUser(objetivo.userId);
  }
});
