import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { ResetPasswordEmail } from "@/emails/reset-password";
import { enviarEmail } from "@/lib/email/send";

/**
 * Send Email Hook de Supabase Auth (VGRP-25).
 *
 * ============================================================================
 * ⚠️ ESTE ENDPOINT NO ESTÁ ACTIVO Y NO HAY QUE ACTIVARLO TODAVÍA.
 * ============================================================================
 *
 * El hook se registra a mano en el dashboard de Supabase (Authentication →
 * Hooks → Send Email). En el momento exacto en que se registra, **Supabase deja
 * de mandar sus propios emails** y pasa a llamar únicamente a esta URL. O sea:
 * si se registra antes de tener un dominio propio con SPF y DKIM verificados en
 * Resend, la recuperación de contraseña **se rompe para todos los usuarios
 * reales** — Supabase ya no manda, y nosotros solo podemos entregar a la casilla
 * del dueño de la cuenta de Resend.
 *
 * Regla de secuencia, en este orden y sin saltear pasos:
 *   comprar dominio → alta en Resend → SPF + DKIM en el DNS → VERIFICADO →
 *   recién ahí registrar el hook.
 *
 * Hasta entonces sigue activo el email por defecto de Supabase, que funciona.
 * Los pasos completos están en `docs/EMAIL.md`.
 *
 * ============================================================================
 * Por qué se verifica la firma antes de cualquier otra cosa
 * ============================================================================
 *
 * Esta ruta es una superficie PÚBLICA en internet: cualquiera puede hacerle POST.
 * Sin verificar la firma, cualquier persona podría hacer que la plataforma mande
 * emails con nuestro remitente, nuestro branding y links arbitrarios, a
 * direcciones arbitrarias. Es una máquina de phishing con reputación de dominio
 * incluida — y de paso quema la cuota de Resend.
 *
 * Supabase firma el payload con el estándar **Standard Webhooks** (headers
 * `webhook-id`, `webhook-timestamp`, `webhook-signature`). La verificación
 * también chequea el timestamp, así que cubre replay de un payload viejo
 * capturado. Firma inválida o ausente → 401 y NO se envía nada. Falta el secreto
 * en el entorno → 500 y NO se envía nada (fail closed: nunca se manda un email
 * que no se pudo verificar).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payload del Send Email Hook. Solo se declaran los campos que se usan; el resto
 * de las claves que manda Supabase se ignoran (el schema no es `strict`) para que
 * un campo nuevo del lado de ellos no rompa el endpoint.
 */
const payloadSchema = z.object({
  user: z.object({
    email: z.email(),
  }),
  email_data: z.object({
    token: z.string(),
    token_hash: z.string(),
    redirect_to: z.string(),
    email_action_type: z.string(),
    site_url: z.string(),
  }),
});

/**
 * Supabase entrega el secreto con el formato `v1,whsec_<base64>`. La librería
 * `standardwebhooks` ya sabe sacar el prefijo `whsec_`, pero no el `v1,`.
 */
function normalizarSecreto(secreto: string): string {
  return secreto.replace(/^v1,/, "");
}

/** Formato de error que espera Supabase Auth del hook. */
function respuestaDeError(httpCode: number, message: string): Response {
  return Response.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

/**
 * Log de los problemas del hook que NO son fallos de entrega de email: secreto
 * mal configurado, payload inválido, tipo sin plantilla. Se mantiene separado de
 * `reportarFalloDeEmail()` a propósito — cuando entre Sentry en VGRP-41, mezclar
 * "Resend no entregó" con "el webhook está mal configurado" en el mismo evento
 * haría que las dos alertas se tapen entre sí.
 */
function reportarProblemaDeHook(detalle: string): void {
  console.error(`[email-hook] ${detalle}`);
}

export async function POST(request: Request): Promise<Response> {
  const secreto = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secreto) {
    reportarProblemaDeHook("SEND_EMAIL_HOOK_SECRET no está configurada");
    return respuestaDeError(500, "El hook de email no está configurado.");
  }

  // El cliente se construye FUERA del try de `verify()`: si el secreto tiene un
  // formato que `standardwebhooks` no puede decodificar, el constructor lanza — y
  // si eso cayera en el mismo catch, un error de configuración se reportaría como
  // "firma inválida" (401), que es un diagnóstico engañoso justo en el momento en
  // que alguien está registrando el hook por primera vez.
  let verificador: Webhook;
  try {
    verificador = new Webhook(normalizarSecreto(secreto));
  } catch (error) {
    reportarProblemaDeHook(`SEND_EMAIL_HOOK_SECRET con formato inválido: ${String(error)}`);
    return respuestaDeError(500, "El hook de email no está configurado.");
  }

  // El body se lee como TEXTO CRUDO: la firma se calcula sobre los bytes exactos
  // que mandó Supabase. Parsear a JSON y volver a serializar cambiaría el orden
  // de las claves o el espaciado y rompería la verificación.
  const cuerpoCrudo = await request.text();

  try {
    verificador.verify(cuerpoCrudo, {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    });
  } catch {
    // Deliberadamente sin detalle en la respuesta: a un atacante no se le explica
    // por qué falló la validación.
    return respuestaDeError(401, "Firma inválida.");
  }

  let parseado: z.infer<typeof payloadSchema>;
  try {
    parseado = payloadSchema.parse(JSON.parse(cuerpoCrudo));
  } catch (error) {
    reportarProblemaDeHook(`payload inválido: ${String(error)}`);
    return respuestaDeError(400, "Payload inválido.");
  }

  const { user, email_data } = parseado;
  const tipo = email_data.email_action_type;

  // Una vez registrado el hook, Supabase NO manda ningún email por su cuenta —
  // tampoco los tipos que acá no estén implementados. Devolver 200 sin enviar
  // sería un fallo silencioso: el usuario vería "listo, revisá tu mail" y no le
  // llegaría nada nunca. Se devuelve error explícito para que la operación de
  // Auth falle a la vista, y queda registrado en el log.
  //
  // TODO: implementar `signup`, `magiclink`, `invite` y `email_change` ANTES de
  // registrar el hook en el dashboard (ver docs/EMAIL.md).
  if (tipo !== "recovery") {
    reportarProblemaDeHook(`email_action_type sin plantilla implementada: ${tipo}`);
    return respuestaDeError(400, `Tipo de email no implementado todavía: ${tipo}`);
  }

  const url = construirUrlDeConfirmacion(email_data, tipo);
  if (!url) {
    reportarProblemaDeHook("NEXT_PUBLIC_SUPABASE_URL no está configurada");
    return respuestaDeError(500, "Falta configuración de Supabase.");
  }

  const resultado = await enviarEmail({
    para: user.email,
    asunto: "Restablecé tu contraseña de OG Circle",
    // JSX y no `ResetPasswordEmail({...})`: llamar al componente como función
    // devuelve el elemento que él retorna, así que React Email nunca ve el
    // componente como tal (y cualquier hook que se agregue después rompería).
    // Por eso este Route Handler es `.tsx`.
    plantilla: <ResetPasswordEmail url={url} codigo={email_data.token || undefined} />,
    motivo: "reset-password",
  });

  // `enviarEmail()` nunca lanza (ver la regla dura en lib/email/send.ts), así que
  // acá siempre se llega con un resultado y nunca con una excepción. Lo que sí se
  // hace es traducir el fallo a un 500 para ESTE endpoint en particular: el email
  // es el único propósito del request, así que si no salió, la operación de Auth
  // no tiene que reportarse como exitosa. Es lo contrario del webhook de
  // MercadoPago (Bloque 3), donde el pago se procesa igual y el email es un
  // efecto secundario — ahí el mismo `enviarEmail()` se ignora y se sigue.
  if (!resultado.ok) {
    return respuestaDeError(500, "No se pudo enviar el email.");
  }

  return Response.json({}, { status: 200 });
}

/**
 * Arma la URL de confirmación del reset.
 *
 * Se usa el endpoint `/auth/v1/verify` del propio Supabase, que es exactamente lo
 * que resuelve `{{ .ConfirmationURL }}` en las plantillas por defecto. Ventaja:
 * funciona hoy, sin depender de ninguna ruta de la app que todavía no existe.
 *
 * TODO: cuando exista una ruta `/auth/confirm` en la app (que reciba `token_hash`
 * y llame a `supabase.auth.verifyOtp()`), migrar a esa — es el camino recomendado
 * para el flujo PKCE y deja el control del redirect del lado nuestro.
 */
function construirUrlDeConfirmacion(
  emailData: { token_hash: string; redirect_to: string; site_url: string },
  // El `type` sale del payload y no está hardcodeado en "recovery" aunque hoy el
  // caller ya filtre por ese tipo: cuando se implementen `signup`, `magiclink`,
  // `invite` y `email_change`, un literal acá sería un desajuste silencioso —
  // el link verificaría el token con el tipo equivocado.
  tipo: string,
): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    return null;
  }
  const url = new URL("/auth/v1/verify", base);
  url.searchParams.set("token", emailData.token_hash);
  url.searchParams.set("type", tipo);
  url.searchParams.set("redirect_to", resolverRedirect(emailData));
  return url.toString();
}

/**
 * Elige el `redirect_to` final, con allowlist por origen.
 *
 * `redirect_to` llega dentro del payload del hook. La firma ya garantiza que el
 * payload viene de Supabase, así que esto no protege de un atacante externo —
 * protege de una mala configuración: si alguien deja la lista de "Redirect URLs"
 * del proyecto demasiado abierta, este endpoint terminaría poniendo un destino
 * arbitrario dentro de un email firmado con nuestro dominio. Un open redirect en
 * un mail de reset de contraseña es exactamente la pieza que le falta a un
 * phishing creíble.
 *
 * Regla: solo se acepta un `redirect_to` que apunte al MISMO ORIGEN que
 * `site_url` (que lo fija la configuración del proyecto, no el request). En
 * cualquier otro caso se cae a `site_url`, que siempre es un destino seguro.
 */
function resolverRedirect(emailData: { redirect_to: string; site_url: string }): string {
  if (!emailData.redirect_to) {
    return emailData.site_url;
  }
  try {
    const destino = new URL(emailData.redirect_to);
    const permitido = new URL(emailData.site_url);
    // El chequeo de protocolo va aparte del de origen: `javascript:` y `data:`
    // producen `origin === "null"`, así que comparar solo orígenes los dejaría
    // pasar si `site_url` también estuviera rota.
    const esWeb = destino.protocol === "https:" || destino.protocol === "http:";
    // Se devuelve el string crudo y no `destino.toString()`: las dos ramas tienen
    // que devolver el valor tal cual vino, sin canonicalizar una sí y la otra no.
    return esWeb && destino.origin === permitido.origin
      ? emailData.redirect_to
      : emailData.site_url;
  } catch {
    // `redirect_to` no es una URL absoluta válida: no se adivina, se usa site_url.
    return emailData.site_url;
  }
}
