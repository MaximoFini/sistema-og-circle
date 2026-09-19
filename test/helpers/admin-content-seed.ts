// VGRP-55 punto 1 — helper para que los e2e de canario (agentes/servicios
// financieros) siembren sus filas de prueba a través del MISMO camino que un
// admin real: `POST /api/admin/contenido/<entidad>`.
//
// Por qué no un insert directo con el cliente admin (como se hacía antes de
// este ticket): `lib/data/agentes.ts`/`lib/data/servicios.ts` ahora cachean
// la lectura de filas (`unstable_cache` + tag) y sólo se invalidan cuando
// alguien llama a `revalidateTag()` — que el Route Handler de arriba dispara
// en cada escritura real. Un insert directo a la tabla no pasa por ahí: la
// fila queda en la base pero el próximo `GET /api/agentes` puede seguir
// sirviendo la lista vieja desde caché. Sembrar por la API real hace que el
// test ejercite la invalidación de verdad, en vez de asumir que "insertar ==
// visible al instante" — esa asunción es justo la que la caché rompe.
//
// Usa un `BrowserContext` aparte (login como el admin seed) para no pisar la
// sesión del `page` principal del test, que loguea como el usuario
// principiante/avanzado bajo prueba.

import type { Browser } from "@playwright/test";
import { SEED_ADMIN_USER } from "./seed-users";

async function crearContenidoViaAdmin<T extends { id: string }>(
  browser: Browser,
  entidad: "agentes" | "servicios_financieros",
  valores: Record<string, unknown>,
): Promise<T> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(SEED_ADMIN_USER.email);
    await page.getByLabel("Contraseña").fill(SEED_ADMIN_USER.password);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await page.waitForURL("**/dashboard");

    const res = await page.request.post(`/api/admin/contenido/${entidad}`, { data: valores });
    if (!res.ok()) {
      throw new Error(
        `POST /api/admin/contenido/${entidad} devolvió ${res.status()}: ${await res.text()}`,
      );
    }
    return (await res.json()) as T;
  } finally {
    await context.close();
  }
}

export async function sembrarAgenteViaAdmin(
  browser: Browser,
  valores: {
    nombre: string;
    especialidad: string;
    nivel_requerido: "ninguno" | "principiante" | "avanzado";
    contacto: string;
    orden?: number;
  },
): Promise<{ id: string }> {
  return crearContenidoViaAdmin(browser, "agentes", { activo: true, orden: 9999, ...valores });
}

export async function sembrarServicioViaAdmin(
  browser: Browser,
  valores: {
    titulo: string;
    descripcion: string;
    nivel_requerido: "ninguno" | "principiante" | "avanzado";
    orden?: number;
  },
): Promise<{ id: string }> {
  return crearContenidoViaAdmin(browser, "servicios_financieros", {
    activo: true,
    orden: 0,
    ...valores,
  });
}
