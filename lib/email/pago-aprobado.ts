import "server-only";

import type { NivelAcceso } from "../database.types";

/**
 * Punto de enganche para el email de confirmación de pago (VGRP-23).
 *
 * NO implementa la plantilla real — eso es VGRP-26, un ticket que no está en
 * este batch. Por ahora sólo deja constancia en el log de que un pago
 * aprobado debería disparar un email, con los datos que esa plantilla va a
 * necesitar.
 *
 * TODO(VGRP-26): reemplazar por enviarEmail() con la plantilla real de
 * confirmación de pago.
 *
 * El webhook de Mercado Pago la llama SIN `await` (fire-and-forget): el email
 * nunca bloquea la respuesta del webhook, igual que documenta el comentario
 * de referencia en `app/api/auth/send-email/route.tsx` sobre el diseño de
 * este mismo webhook. Por eso esta función tampoco debería poder lanzar — hoy
 * sólo hace un `console.info`, así que no hay ninguna vía de error real, pero
 * si VGRP-26 la reemplaza por algo que sí pueda fallar, tiene que preservar
 * esta propiedad (igual que `enviarEmail()` en `lib/email/send.ts`).
 */
export function notificarPagoAprobado(datos: {
  userId: string;
  nivel: NivelAcceso;
  montoArs: number;
}): void {
  console.info(
    `[pago-aprobado] userId=${datos.userId} nivel=${datos.nivel} montoArs=${datos.montoArs}`,
  );
}
