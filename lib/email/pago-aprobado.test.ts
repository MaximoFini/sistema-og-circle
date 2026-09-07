// VGRP-46 — test de `notificarPagoAprobado()` (lib/email/pago-aprobado.ts).
//
// Hoy es un stub (sólo `console.info`, ver VGRP-26 pendiente): no hay
// plantilla real ni envío por Resend todavía, así que no hay nada que
// mockear (`vi.mock`) acá. Lo único que se puede probar honestamente es la
// propiedad de la que depende el webhook de Mercado Pago (VGRP-23): esta
// función es fire-and-forget (el webhook la llama sin `await` y, en al menos
// un punto, sin try/catch alrededor) y por lo tanto NUNCA puede lanzar — si
// lo hiciera, tumbaría el 200 de la respuesta del webhook.
//
// El resto del comportamiento esperado (envío real por Resend con la
// plantilla de confirmación de pago) todavía no existe en el repo — es
// VGRP-26. No se inventa acá un mock de una plantilla que no existe: se deja
// como `it.todo(...)`.

import { describe, expect, it, vi } from "vitest";
import { notificarPagoAprobado } from "./pago-aprobado";

describe("notificarPagoAprobado", () => {
  it("nunca lanza una excepción (fire-and-forget, invocada sin await/try-catch desde el webhook)", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    expect(() =>
      notificarPagoAprobado({ userId: "user-123", nivel: "principiante", montoArs: 75000 }),
    ).not.toThrow();

    vi.restoreAllMocks();
  });

  // TODO(VGRP-26): implementar el envío real por Resend con la plantilla de
  // confirmación de pago. Hasta que exista esa plantilla, no hay nada
  // honesto que testear acá más allá de la propiedad de arriba.
  it.todo(
    "envía el email de confirmación de pago con la plantilla real por Resend (VGRP-26, no implementado todavía)",
  );
});
