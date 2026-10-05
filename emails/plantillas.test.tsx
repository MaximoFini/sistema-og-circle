// VGRP-26 — render de las plantillas de `emails/` a HTML y chequeo de los datos clave.
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { AuthGenericoEmail } from "./auth-generico";
import { BienvenidaEmail } from "./bienvenida";
import { PagoConfirmadoEmail } from "./pago-confirmado";
import { ResetPasswordEmail } from "./reset-password";

describe("plantillas de email", () => {
  it("bienvenida renderiza con nombre y url del dashboard", async () => {
    const html = await render(
      BienvenidaEmail({ nombre: "Ana", url: "https://ogcircle.com.ar/dashboard" }),
    );
    expect(html).toContain("Ana");
    expect(html).toContain("https://ogcircle.com.ar/dashboard");
  });

  it("pago-confirmado renderiza con monto en ARS formateado y referencia", async () => {
    const html = await render(
      PagoConfirmadoEmail({
        nombre: "Ana",
        montoArs: 75000,
        referencia: "MP-123456",
        url: "https://ogcircle.com.ar/dashboard",
      }),
    );
    expect(html).toContain("75.000");
    expect(html).toContain("MP-123456");
    expect(html).toContain("Plan activado");
  });

  it("auth-generico renderiza título, cta y url", async () => {
    const html = await render(
      AuthGenericoEmail({
        titulo: "Confirmá tu cuenta",
        texto: "Tocá el botón para confirmar.",
        cta: "Confirmar cuenta",
        url: "https://ogcircle.com.ar/confirmar?token=abc",
      }),
    );
    expect(html).toContain("Confirmá tu cuenta");
    expect(html).toContain("Confirmar cuenta");
    expect(html).toContain("https://ogcircle.com.ar/confirmar?token=abc");
  });

  it("reset-password renderiza con la url de un solo uso", async () => {
    const html = await render(
      ResetPasswordEmail({ url: "https://ogcircle.com.ar/reset?token=xyz" }),
    );
    expect(html).toContain("Restablecé tu contraseña");
    expect(html).toContain("https://ogcircle.com.ar/reset?token=xyz");
  });
});
