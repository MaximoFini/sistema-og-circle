import { expect, test } from "@playwright/test";

// Smoke test de la infraestructura de E2E (VGRP-43): no toca la base de
// datos ni requiere el seed, a propósito — solo prueba que Playwright está
// bien cableado (build, server, browser, config) antes de que VGRP-45 y
// VGRP-42 agreguen ahí los dos flujos críticos reales de STACK.md §9.
test("la landing responde y renderiza", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/.+/);
});
