import "server-only";

import { BienvenidaEmail } from "../../emails/bienvenida";
import { getSiteUrl } from "../site-url";
import { createServiceRoleClient } from "../supabase/service-role";
import { enviarEmail, reportarFalloDeEmail } from "./send";

/**
 * Email de bienvenida (VGRP-26), compartido por el registro con email
 * (`registrarse()`) y el primer login con Google (`app/auth/callback/google`).
 *
 * NUNCA lanza: los callers lo disparan sin `await` para no bloquear el
 * redirect. Si el envío sale OK, marca `profiles.bienvenida_enviada_at` con
 * service_role; el `.is(null)` evita pisar una marca previa si dos callbacks
 * corren en paralelo.
 */
export async function dispararBienvenida(params: {
  userId: string;
  email: string;
  nombre: string | null;
}): Promise<void> {
  try {
    const resultado = await enviarEmail({
      para: params.email,
      asunto: "Bienvenido a OG Circle",
      plantilla: BienvenidaEmail({
        nombre: params.nombre ?? "",
        url: `${getSiteUrl()}/dashboard`,
      }),
      motivo: "bienvenida",
    });
    if (!resultado.ok) return;

    const { error } = await createServiceRoleClient()
      .from("profiles")
      .update({ bienvenida_enviada_at: new Date().toISOString() })
      .eq("id", params.userId)
      .is("bienvenida_enviada_at", null);

    if (error) reportarFalloDeEmail("bienvenida-marca", error);
  } catch (error) {
    reportarFalloDeEmail("bienvenida", error);
  }
}
