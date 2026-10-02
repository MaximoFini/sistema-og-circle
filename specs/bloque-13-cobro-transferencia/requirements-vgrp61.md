# Requirements: Desactivar Mercado Pago sin borrar la integración (VGRP-61)

**Status:** Approved (2026-10-02)
**Last updated:** 2026-10-02
**Ticket:** VGRP-61 (Bloque 13 — cobro por transferencia)
**Depende de:** VGRP-59/60 (plan único) y el fix de merge de #35

## Summary

El equipo decidió (02/10/2026) cobrar por **transferencia bancaria con comprobante**, aprobada a mano por los dueños de OG Circle. Mercado Pago **se apaga, pero no se borra**. Un flag de Edge Config (`flags.mercadopago_habilitado`) decide si se puede iniciar un pago con MP. Con el flag apagado, ningún camino lleva a MP. Con el flag prendido, todo funciona igual que hoy. Prenderlo o apagarlo no requiere deploy.

## Goals

- Que hoy nadie pueda iniciar un pago con Mercado Pago, ni desde la UI ni llamando directo al Server Action.
- Que la integración con MP (checkout, webhook, validación de firma, mapeo de estados y sus tests) siga en el repo, en verde y lista para volver a prenderse con un cambio de configuración.
- Que un admin pueda prender o apagar MP desde `/admin/config` sin tocar código.
- Que no se pierda ningún pago legítimo de MP que llegue tarde.

## Non-goals

- **La pantalla de pago por transferencia** (cuenta, subida de comprobante, estados): es VGRP-64. Acá `/comprar` solo deja de ofrecer MP (ver Open questions).
- Cuentas de cobro, comprobantes y el panel de revisión: son VGRP-62, 63 y 65.
- Darle una función a `flags.checkout_habilitado`. Hoy no lo lee ningún código y sigue así; solo se aclara en el panel y en la doc (decisión del 02/10/2026).
- Textos legales que todavía nombran a MP (`/privacidad`, `/reembolsos`): es VGRP-67.
- Borrar, comentar o saltear cualquier código o test de `lib/mercadopago/` o `app/api/webhooks/mercadopago/`.
- Los E2E del bloque con el flag prendido o apagado (`pago-aprobado-acceso.spec.ts`, etc.): es VGRP-66. Acá alcanza con tests unitarios y de route handler.

## User stories

### US-1: El checkout de MP no se puede iniciar con el flag apagado (servidor)

Como dueño de OG Circle, quiero que con MP apagado nadie pueda generar un cobro de Mercado Pago, ni siquiera invocando el Server Action directo, para que todos los cobros pasen por transferencia.

**Acceptance criteria:**

- WHILE `flags.mercadopago_habilitado` es `false` WHEN se invoca `crearCheckout()` THE SYSTEM SHALL devolver `{ ok: false, error }` con un mensaje para el usuario, y SHALL NOT armar la preferencia ni llamar a la API de Mercado Pago.
- WHILE `flags.mercadopago_habilitado` es `false` THE SYSTEM SHALL NOT registrar el evento de analytics `checkout_iniciado`.
- IF no se pueden leer los flags de Edge Config (caído, sin configurar o valor inválido) THEN THE SYSTEM SHALL tratar a MP como apagado (fail-closed, igual que el resto de los flags).
- WHILE `flags.mercadopago_habilitado` es `true` THE SYSTEM SHALL comportarse en `crearCheckout()` exactamente como hoy. Los tests actuales del checkout siguen en verde y sin `skip`.

### US-2: `/comprar` no ofrece MP con el flag apagado (UI)

Como usuario sin plan, quiero que `/comprar` no me muestre un botón de pago que no funciona, para no quedar trabado en un flujo apagado.

**Acceptance criteria:**

- WHILE `flags.mercadopago_habilitado` es `false` WHEN un usuario abre `/comprar` THE SYSTEM SHALL NOT renderizar `ComprarButton` ni la frase que nombra a Mercado Pago ("Se activa apenas Mercado Pago confirma el pago").
- WHILE `flags.mercadopago_habilitado` es `false` THE SYSTEM SHALL seguir mostrando el nombre y el precio del plan, sin agregar ninguna pantalla ni estado nuevo. Qué método de pago se ofrece en su lugar lo resuelve VGRP-64.
- WHILE `flags.mercadopago_habilitado` es `true` THE SYSTEM SHALL mostrar `/comprar` exactamente como hoy.
- THE SYSTEM SHALL seguir mostrando "Ya tenés este plan" a un usuario que ya tiene el plan, con el flag prendido o apagado.

### US-3: Los pagos tardíos de MP se siguen procesando

Como usuario que pagó con MP justo antes del apagado, quiero que mi pago se acredite igual, para no pagar y quedarme sin acceso.

**Acceptance criteria:**

- WHILE `flags.mercadopago_habilitado` es `false` WHEN llega una notificación al webhook `/api/webhooks/mercadopago` THE SYSTEM SHALL procesarla igual que hoy: valida la firma HMAC, consulta el estado a la API de MP, registra en el ledger y proyecta el nivel.
- THE SYSTEM SHALL dejar documentado en el código del webhook por qué no se apaga con el flag.
- WHILE `flags.mercadopago_habilitado` es `false` THE SYSTEM SHALL mantener accesible `/comprar/pendiente`, que es el `back_url` de los checkouts ya iniciados.

### US-4: Un admin prende o apaga MP desde el panel

Como admin, quiero un toggle "Mercado Pago habilitado" en `/admin/config`, para prender o apagar MP sin pedirle un deploy a nadie.

**Acceptance criteria:**

- WHEN un admin abre `/admin/config` THE SYSTEM SHALL mostrar en `FlagsForm` un checkbox "Mercado Pago habilitado" con su estado actual y una aclaración visible de que hoy el método de cobro es la transferencia.
- WHEN un admin guarda los flags THE SYSTEM SHALL persistir `mercadopago_habilitado` en Edge Config por el mismo endpoint, con la misma validación y el mismo registro de auditoría que los otros flags.
- THE SYSTEM SHALL aclarar junto al checkbox "Checkout habilitado" que hoy no controla nada.
- IF un usuario que no es admin intenta modificar el flag THEN THE SYSTEM SHALL rechazarlo como hoy (403).

### US-5: El flag nuevo no rompe la configuración existente

Como equipo, queremos que agregar el flag no apague nada más por accidente.

**Acceptance criteria:**

- IF el valor de `flags` en Edge Config no trae la clave `mercadopago_habilitado` (es el caso de producción hoy) THEN THE SYSTEM SHALL interpretarla como `false` y SHALL seguir respetando `registro_habilitado`, `checkout_habilitado` y `fase` tal como están cargados. Agregar la clave no puede invalidar todo el objeto ni hacer caer a los defaults.

### US-6: El build y la doc no dependen de MP

Como dev, quiero que el proyecto compile y arranque sin las variables de MP mientras esté apagado, y que esté documentado cómo reactivarlo.

**Acceptance criteria:**

- THE SYSTEM SHALL compilar (`next build`) y arrancar sin `MERCADOPAGO_ACCESS_TOKEN` ni `MERCADOPAGO_WEBHOOK_SECRET` definidas.
- `.env.example` SHALL marcar las variables de MP como opcionales mientras el flag esté apagado.
- `STACK.md` (sección de pagos) y `docs/EDGE-CONFIG.md` SHALL decir que MP está desactivado por flag, qué hace y qué no hace el flag (el webhook sigue activo) y los pasos para reactivarlo.

## Constraints

- **No se borra ni se comenta código de MP.** Ningún archivo de `lib/mercadopago/` ni de `app/api/webhooks/mercadopago/` se borra, y ningún test existente se saltea.
- **El chequeo es de servidor.** La UI no alcanza, porque un Server Action se puede invocar directo (CLAUDE.md).
- **Fail-closed en dinero:** ante cualquier duda (Edge Config caído, valor inválido), MP queda apagado.
- **Sin migración de base de datos.** Es un cambio de configuración y de código.
- Sistema visual Liquid Glass para cualquier UI nueva o modificada (`DESIGN.md`), y `/design-critique` sobre `/comprar` y `/admin/config` (checklist de CLAUDE.md).
- `docs/RENDIMIENTO.md`: `/comprar` es `force-dynamic` y no puede sumar peso de bundle de cliente sin justificación.

- **Cambio mínimo** (decisión del 02/10/2026): solo lo que pide el ticket, sin pantallas, estados ni refactors extra.

## Open questions

Ninguna. Las dos que quedaban se resuelven en tickets siguientes (decisión del 02/10/2026):

- Qué ve el usuario en `/comprar` con MP apagado mientras no exista la pantalla de transferencia → VGRP-64.
- Cuándo se apaga MP en producción (el flag arranca en `false`, como pide el ticket) → coordinación del deploy del bloque.
