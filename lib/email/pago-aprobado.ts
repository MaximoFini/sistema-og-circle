import "server-only";

import { PagoConfirmadoEmail } from "../../emails/pago-confirmado";
import type { NivelAcceso } from "../database.types";
import { getSiteUrl } from "../site-url";
import { createServiceRoleClient } from "../supabase/service-role";
import { enviarEmail, reportarFalloDeEmail } from "./send";

/**
 * Email de confirmación de pago (VGRP-26).
 *
 * El webhook de Mercado Pago la llama SIN `await` (fire-and-forget): el email
 * nunca bloquea ni tira abajo el 200 del webhook. Por eso esta función NUNCA
 * lanza: cualquier falla (perfil inexistente, error de Postgres, Resend caído)
 * se reporta con `reportarFalloDeEmail` y termina ahí.
 *
 * `referencia` es el paymentId de Mercado Pago, para que el usuario pueda
 * citarlo si consulta por el pago.
 */
export async function notificarPagoAprobado(datos: {
  userId: string;
  nivel: NivelAcceso;
  montoArs: number;
  referencia: string;
}): Promise<void> {
  try {
    const { data: perfil, error } = await createServiceRoleClient()
      .from("profiles")
      .select("email, nombre")
      .eq("id", datos.userId)
      .maybeSingle();

    if (error) {
      reportarFalloDeEmail("pago-confirmado", error);
      return;
    }
    if (!perfil) {
      reportarFalloDeEmail("pago-confirmado", `no existe profile para userId=${datos.userId}`);
      return;
    }

    await enviarEmail({
      para: perfil.email,
      asunto: "Confirmamos tu compra en OG Circle",
      plantilla: PagoConfirmadoEmail({
        nombre: perfil.nombre ?? "",
        montoArs: datos.montoArs,
        referencia: datos.referencia,
        url: `${getSiteUrl()}/dashboard`,
      }),
      motivo: "pago-confirmado",
    });
  } catch (error) {
    reportarFalloDeEmail("pago-confirmado", error);
  }
}
