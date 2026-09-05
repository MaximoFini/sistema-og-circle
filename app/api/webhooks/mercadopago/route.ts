import * as Sentry from "@sentry/nextjs";
import { track } from "@vercel/analytics/server";
import { z } from "zod";
import { insertarPago, proyectarNivel } from "@/lib/data/pagos";
import type { Json, NivelAcceso } from "@/lib/database.types";
import { notificarPagoAprobado } from "@/lib/email/pago-aprobado";
import { getEnv } from "@/lib/env";
import { getPaymentClient } from "@/lib/mercadopago/client";
import { mapearEstadoMercadoPago } from "@/lib/mercadopago/mapEstado";
import { validarFirmaMercadoPago } from "@/lib/mercadopago/validarFirma";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Webhook de notificaciones de pago de Mercado Pago (VGRP-23).
 *
 * ============================================================================
 * El componente más crítico de la fase
 * ============================================================================
 * Si esto falla, alguien pagó y no tiene acceso (o peor: se le da acceso sin
 * haber pagado). El diseño de este archivo prioriza, en este orden:
 *
 *   1. Nunca confiar en el body del webhook sin verificar la firma primero.
 *   2. Nunca confiar en el `status` del BODY del webhook — siempre se
 *      re-consulta el estado real contra la API de MP con el `data.id`.
 *   3. Idempotencia: un reintento de MP para la misma notificación no debe
 *      duplicar el efecto (lo garantiza `insertarPago`, ver lib/data/pagos.ts).
 *   4. Responder 200 en todo caso "procesado o descartado a conciencia"
 *      (duplicado, tipo irrelevante, estado no mapeable, referencia
 *      faltante) para que MP no reintente indefinidamente algo que nunca
 *      vamos a poder resolver — y 500 sólo cuando SÍ queremos que reintente
 *      (fallo de red, error de Postgres real, fallo de `proyectarNivel`).
 *
 * Es "lo contrario" del webhook del Send Email Hook de Supabase (ver el
 * comentario en `app/api/auth/send-email/route.tsx`): ahí el email ES el
 * propósito del request y un fallo de envío es un 500. Acá el pago se procesa
 * igual y el email de confirmación es un efecto secundario fire-and-forget
 * que nunca bloquea ni tira abajo la respuesta 200.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payload mínimo que este webhook necesita del body. Sin `strict`: Mercado
 * Pago manda otros campos (`action`, `api_version`, `date_created`, `user_id`
 * a nivel raíz, etc.) que se ignoran a propósito para que un campo nuevo del
 * lado de ellos no rompa el endpoint.
 */
const payloadSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.union([z.string(), z.number()]),
  }),
});

/** Arma la respuesta de error estándar de este endpoint. */
function respuestaDeError(httpCode: number, message: string): Response {
  return Response.json({ error: message }, { status: httpCode });
}

/**
 * Log de problemas de CONFIGURACIÓN o PAYLOAD inválido — separado a
 * propósito de los errores de negocio/infraestructura de más abajo (mismo
 * criterio que `reportarProblemaDeHook()` en el webhook de referencia): "el
 * webhook está mal configurado" y "esta notificación puntual no se pudo
 * procesar" son alertas distintas y no deberían taparse entre sí cuando entre
 * Sentry (VGRP-41).
 */
function reportarProblemaDeHook(detalle: string): void {
  console.error(`[mercadopago-webhook] ${detalle}`);
  // Severidad baja (VGRP-41): caso ya manejado a conciencia (se responde
  // 200), no un fallo que amerite la misma urgencia que
  // `reportarFalloDeProcesamiento`. Fail-open: sin `SENTRY_DSN`,
  // `Sentry.init` nunca corrió (ver instrumentation.ts) y esta llamada no
  // hace nada.
  Sentry.captureMessage(`[mercadopago-webhook] ${detalle}`, "warning");
}

/**
 * Log de fallos de negocio/infraestructura reales — el que VGRP-41 va a
 * convertir en alerta con severidad alta. Separado de `reportarProblemaDeHook`
 * porque acá el 500 le pide a MP que reintente; ahí no.
 */
function reportarFalloDeProcesamiento(detalle: string, error: unknown): void {
  const detalleError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[mercadopago-webhook] ${detalle}: ${detalleError}`);
  // VGRP-41 — el corazón de este ticket: severidad alta, es el caso que
  // corresponde al 500 (fallo real, MP va a reintentar). Fail-open: sin
  // `SENTRY_DSN`, `Sentry.init` nunca corrió (ver instrumentation.ts) y
  // `captureException` no hace nada — no lanza, no rompe el flujo del
  // webhook.
  //
  // Pendiente (fuera de este batch): cuando exista el panel de admin
  // (VGRP-35/36/37) tiene que poder leer también los pagos con `estado` que
  // no llegó a proyectarse (PRD §3.8, flujo de recuperación ante webhook
  // fallido) — ver docs/OBSERVABILIDAD.md. La alerta por email de este
  // capture la configura alguien con acceso al dashboard de Sentry (Alert
  // Rule), no algo que el código pueda hacer por sí solo.
  Sentry.captureException(error, { extra: { detalle } });
}

/**
 * Log de una notificación que se descarta A CONCIENCIA porque nunca vamos a
 * poder correlacionarla con un usuario/nivel (falta `external_reference` o
 * `metadata.nivel`). Es la señal más clara de que algo salió mal en el
 * checkout — VGRP-41 tiene que poder verla en los logs, separada de los casos
 * de arriba.
 */
function reportarPagoSinCorrelacion(detalle: string): void {
  console.error(`[mercadopago-webhook] pago sin correlación posible: ${detalle}`);
  // Severidad baja (VGRP-41), mismo criterio que reportarProblemaDeHook: se
  // ackea con 200, no es un fallo. Fail-open sin SENTRY_DSN.
  Sentry.captureMessage(
    `[mercadopago-webhook] pago sin correlación posible: ${detalle}`,
    "warning",
  );
}

const NIVELES_COMPRABLES = new Set<NivelAcceso>(["principiante", "avanzado"]);

function esNivelComprable(valor: unknown): valor is NivelAcceso {
  return typeof valor === "string" && NIVELES_COMPRABLES.has(valor as NivelAcceso);
}

export async function POST(request: Request): Promise<Response> {
  let secret: string;
  try {
    secret = getEnv(
      "MERCADOPAGO_WEBHOOK_SECRET",
      "Necesario para validar la firma HMAC del webhook de Mercado Pago (VGRP-23). Ver .env.example.",
    );
  } catch (error) {
    reportarProblemaDeHook(`MERCADOPAGO_WEBHOOK_SECRET no está configurada: ${String(error)}`);
    return respuestaDeError(500, "El webhook de Mercado Pago no está configurado.");
  }

  const url = new URL(request.url);
  const dataIdQuery = url.searchParams.get("data.id");

  const firmaValida = validarFirmaMercadoPago({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId: dataIdQuery,
    secret,
  });

  if (!firmaValida) {
    // Deliberadamente sin detalle en la respuesta: a un atacante no se le
    // explica por qué falló la validación.
    return respuestaDeError(401, "Firma inválida.");
  }

  // El body se lee como TEXTO CRUDO antes de cualquier `JSON.parse`: la firma
  // ya se validó arriba usando headers + query string, pero se mantiene el
  // mismo orden (texto crudo primero) que el webhook de referencia por
  // consistencia y para no tentar a nadie a mover el parseo antes a futuro.
  const cuerpoCrudo = await request.text();

  let parseado: z.infer<typeof payloadSchema>;
  try {
    parseado = payloadSchema.parse(JSON.parse(cuerpoCrudo));
  } catch (error) {
    reportarProblemaDeHook(`payload inválido: ${String(error)}`);
    return respuestaDeError(400, "Payload inválido.");
  }

  // MP manda otros tipos de eventos (`merchant_order`, etc.) que no nos
  // interesan. Hay que ackearlos igual (200) para que no sigan reintentando.
  if (parseado.type !== "payment") {
    return Response.json({}, { status: 200 });
  }

  // Preferimos el `data.id` del QUERY STRING (el que efectivamente se firmó)
  // por sobre el del body — deberían coincidir, pero éste es el que MP
  // garantiza que forma parte del manifest firmado.
  const paymentId = dataIdQuery ?? String(parseado.data.id);

  try {
    const paymentClient = getPaymentClient();
    const pago = await paymentClient.get({ id: paymentId });

    const estadoInterno = pago.status ? mapearEstadoMercadoPago(pago.status) : null;
    if (!estadoInterno) {
      // Estado no contemplado: mejor no escribir algo que no sabemos
      // interpretar que inventar uno. Se ackea igual (200) para no generar
      // reintentos infinitos de un estado que jamás vamos a mapear distinto.
      reportarProblemaDeHook(
        `status de MP sin mapeo conocido: paymentId=${paymentId} status=${pago.status}`,
      );
      return Response.json({}, { status: 200 });
    }

    const userId = pago.external_reference;
    const nivelComprado = (pago.metadata as Record<string, unknown> | undefined)?.nivel;

    if (!userId || typeof userId !== "string" || !esNivelComprable(nivelComprado)) {
      reportarPagoSinCorrelacion(
        `paymentId=${paymentId} external_reference=${String(userId)} metadata.nivel=${String(nivelComprado)}`,
      );
      return Response.json({}, { status: 200 });
    }

    const admin = createServiceRoleClient();
    const montoArs = pago.transaction_amount ?? 0;

    const resultado = await insertarPago(admin, {
      userId,
      proveedorRef: String(paymentId),
      nivelComprado,
      montoArs,
      estado: estadoInterno,
      // El objeto completo del pago consultado a la API de MP (`pago`), no el
      // body del webhook (`parseado`, que sólo trae `{type, data.id}`): el PRD
      // pide guardar acá "el evento completo... para auditoría y reproceso", y
      // lo único con valor de auditoría real es la respuesta de la API (monto,
      // estado, external_reference, metadata, payer), no la notificación
      // mínima que sólo nos dijo "andá a buscar este id".
      payloadRaw: pago as unknown as Json,
    });

    // Duplicado: ya se procesó esta notificación (mismo proveedor_ref +
    // estado) anteriormente. NO se vuelve a llamar a `proyectarNivel` — ya se
    // proyectó la primera vez. Se responde 200 de inmediato.
    if (!resultado.inserted) {
      return Response.json({}, { status: 200 });
    }

    if (estadoInterno === "approved") {
      await proyectarNivel(admin, userId);

      // VGRP-41 — evento de conversión por nivel (PRD: cuántos inician
      // checkout vs. cuántos terminan pagando). Mismo criterio de "no
      // bloquear lo importante" que `notificarPagoAprobado` de acá abajo:
      // nunca puede tirar abajo el 200 del webhook.
      try {
        await track("pago_aprobado", { nivel: nivelComprado });
      } catch (error) {
        reportarFalloDeProcesamiento("track('pago_aprobado') falló", error);
      }

      // Fire-and-forget: nunca bloquea la respuesta del webhook ni puede
      // tirar abajo el 200 (ver el comentario de `notificarPagoAprobado`).
      try {
        notificarPagoAprobado({ userId, nivel: nivelComprado, montoArs });
      } catch (error) {
        reportarFalloDeProcesamiento("notificarPagoAprobado falló", error);
      }
    }

    return Response.json({}, { status: 200 });
  } catch (error) {
    // Fallo de red a la API de MP, error de Postgres que no sea el 23505 (ya
    // manejado dentro de `insertarPago`), o fallo de `proyectarNivel`: se
    // responde 500 para que MP reintente el webhook más tarde.
    reportarFalloDeProcesamiento(`fallo procesando paymentId=${paymentId}`, error);
    return respuestaDeError(500, "Fallo procesando la notificación.");
  }
}
