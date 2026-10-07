# Mercado Pago en producción — qué falta y de quién depende

Este documento es para el dueño del negocio (Jota), no para el equipo de desarrollo.
Explica qué hay que hacer, fuera del código, para que los pagos reales lleguen a su
cuenta y la plataforma los active sola. El código (checkout, webhook, validaciones) ya
está hecho y testeado — lo que falta acá son datos y configuración que sólo él puede dar.

## Estado al 06/10/2026

- **Aplicación creada** en la cuenta de Mercado Pago **VERA&DOLEATTO S.A.S.** (nº de
  cuenta 8777916455918302). Es la cuenta que va a recibir los cobros.
- **`MERCADOPAGO_ACCESS_TOKEN` de producción ya cargado** en Vercel (Production).
- **`NEXT_PUBLIC_SITE_URL`** existe en Vercel (Production). Hay que verificar que su
  valor sea `https://plataforma.ogcircle.com.ar` — de eso depende la URL que se le
  manda a Mercado Pago para las notificaciones.
- **Pendiente**:
  - Configurar el webhook en el panel de la aplicación (paso 4), apuntando a
    `https://plataforma.ogcircle.com.ar/api/webhooks/mercadopago`.
  - Cargar `MERCADOPAGO_WEBHOOK_SECRET` en Vercel (Production) con la clave secreta
    que muestra el panel al guardar el webhook.
  - Cargar `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN` en Vercel (Production).

> **Advertencia (importante).** En producción, si falta `MERCADOPAGO_WEBHOOK_SECRET`,
> el checkout queda **bloqueado**: el usuario ve un error genérico y no se crea la
> preferencia en Mercado Pago. Esto lo implementa el ticket VGRP-74 en
> `app/(app)/comprar/_actions.ts`. Es una protección a propósito: no se cobra
> sin poder validar los avisos de pago. Por eso el secreto del webhook es requisito
> antes de abrir los cobros, no un paso opcional.

**Redeploy obligatorio.** Vercel sólo toma las variables de entorno en el deploy que
se construye después de cargarlas. Después de cargar o cambiar cualquier variable
(token, secreto del webhook, DSN de Sentry, URL del sitio), hay que hacer un **redeploy
de Production** desde Vercel → Deployments → (último deploy) → "Redeploy", o hacer un
push a la rama principal. Si no se redeploya, la app sigue corriendo con los valores
viejos (o sin ellos).

## La regla de oro: la plata va a la cuenta dueña del Access Token

Mercado Pago no tiene un "modo producción" que se prenda con un interruptor. Cada
credencial (`MERCADOPAGO_ACCESS_TOKEN`) pertenece a una aplicación creada dentro de
**una cuenta específica de Mercado Pago**. La plata de cada cobro va a la cuenta dueña
de esa aplicación — no a la cuenta de quien escribió el código, ni a la del equipo.

Hoy el repo usa credenciales de **prueba** (sandbox): sirven para probar el flujo
completo sin mover plata real, pero ningún pago hecho con ellas es cobrable. Para que
los pagos reales lleguen a Jota, la aplicación de Mercado Pago tiene que estar creada
**con la cuenta de Mercado Pago de Jota** (la cuenta a nombre de VeGroup/Jota Vera que
va a recibir el dinero).

## Qué tiene que hacer Jota (en orden)

1. **Tener (o crear) una cuenta de Mercado Pago** a nombre del negocio, con los datos
   fiscales correspondientes (CUIT, cuenta bancaria asociada para los retiros).

2. **Crear una aplicación en esa cuenta**, en
   [mercadopago.com.ar/developers/panel](https://www.mercadopago.com.ar/developers/panel)
   → "Tus integraciones" → "Crear aplicación". Cualquier nombre sirve (ej. "OG Circle").

3. **Copiar las credenciales de producción** de esa aplicación (no las de prueba):
   - `Access Token` de producción.
   - (El Public Key de producción no lo usa este repo — el checkout es 100% del lado
     del servidor, Checkout Pro redirige a MP.)

4. **Configurar el webhook** en el panel de esa misma aplicación → "Webhooks" →
   "Configurar notificaciones":
   - URL: `https://<dominio-de-la-plataforma>/api/webhooks/mercadopago`
     (reemplazar `<dominio-de-la-plataforma>` por el dominio real una vez que exista).
   - Eventos: sólo **Pagos** (`payment`) hace falta — el código ignora el resto.
   - Al guardar, Mercado Pago muestra una **clave secreta** (`Webhook secret` /
     `Firma secreta`) — copiarla, es el segundo dato que el equipo necesita.

   Nota técnica (esto ya lo resuelve el código, no requiere nada de Jota): la
   preferencia de cada checkout ya manda esta misma URL en `notification_url`, así que
   el webhook va a recibir notificaciones aunque este paso del panel se saltee — pero
   configurarlo igual es la forma oficial y documentada que recomienda Mercado Pago, y
   sirve como respaldo.

5. **Pasarle al equipo, por un canal seguro (no WhatsApp/email en texto plano)**:
   - El `Access Token` de producción (paso 3).
   - La clave secreta del webhook (paso 4).

   El equipo va a cargar esos dos valores en Vercel (`MERCADOPAGO_ACCESS_TOKEN` y
   `MERCADOPAGO_WEBHOOK_SECRET`, variables de entorno de producción) — nunca se
   commitean al repo.

## Lo que NO depende de Jota (ya resuelto en el código)

- El monto que paga cada usuario se valida contra el precio cargado en Edge Config:
  si alguien manipula un link de pago o el precio cambia a mitad de una compra, el
  pago se guarda pero **no** activa el nivel solo — un admin lo revisa desde el panel.
- Reembolsos y contracargos: si Mercado Pago informa un reembolso, el acceso se
  revoca automáticamente (decisión ya tomada, documentada en el PRD).
- Reintentos de notificación de Mercado Pago (puede reenviar el mismo evento varias
  veces): el webhook es idempotente, nunca duplica un cobro ni un acceso.
- Un usuario no puede volver a comprar un nivel que ya tiene o uno inferior.

## Antes de activar cobros reales — checklist final

- [ ] Cuenta de Mercado Pago de Jota con datos fiscales completos (sin esto, MP puede
      retener los pagos hasta que se completen).
- [x] Aplicación creada con credenciales de **producción** (no sandbox). (06/10/2026)
- [ ] Webhook configurado en el panel de esa aplicación, apuntando al dominio real.
- [ ] `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` de producción cargados
      en Vercel (Production, no sólo Preview/Development).
- [ ] Un pago de prueba chico hecho con una tarjeta real propia, para confirmar que
      el dinero efectivamente entra a la cuenta de Jota y el nivel se activa solo.
- [ ] Alert Rule de Sentry creada para el webhook (ver `docs/OBSERVABILIDAD.md`) — es
      la única forma de enterarse si un cobro real falla en silencio.
