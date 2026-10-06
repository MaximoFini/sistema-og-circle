import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO } from "@/lib/legal/contacto";
import { LegalDocPage } from "../LegalDocPage";

export const metadata: Metadata = { title: "Política de Reembolsos — OG Circle" };

// VGRP-34 — texto publicado de la Política de Reembolsos (antes, placeholder).
// Pendiente la revisión de Jota.
//
// A diferencia de Términos y Privacidad, este texto no es libre: tiene que
// describir EXACTAMENTE lo que el sistema hace, no una política aspiracional
// distinta. `nivel_vigente()` (supabase/migrations/20260822035923_init_plataforma.sql)
// descarta todo pago con una fila `refunded` para el mismo `proveedor_ref`, y el
// webhook de MP vuelve a proyectar el nivel (app/api/webhooks/mercadopago): el
// acceso se revoca solo, sin intervención manual. Si se cambia esa regla, hay
// que cambiar este texto en el mismo PR y subir `TERMINOS_VERSION`.
//
// El plazo de 10 días corridos es el derecho de arrepentimiento de la Ley
// 24.240 (art. 34) y la Res. 424/2020 para contratos a distancia: es un piso
// legal, no una decisión comercial.
export default function ReembolsosPage() {
  return (
    <LegalDocPage title="Política de Reembolsos">
      <p>
        Queremos que compres con tranquilidad. Esta página explica cómo pedir un reembolso por tu
        acceso a OG Circle y qué pasa con tu cuenta cuando se aprueba.
      </p>

      <h2>1. Derecho de arrepentimiento</h2>
      <p>
        Podés arrepentirte de tu compra dentro de los 10 días corridos desde que se confirmó el pago
        (artículo 34 de la Ley de Defensa del Consumidor Nº 24.240), sin dar explicaciones y sin
        costo para vos. Si lo pedís en ese plazo, te devolvemos el importe completo que pagaste.
      </p>

      <h2>2. Cómo pedirlo</h2>
      <ol>
        <li>
          Escribinos desde el email con el que te registraste a{" "}
          <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>, o por el WhatsApp de soporte que figura en
          la plataforma.
        </li>
        <li>
          Indicá tu nombre y el email de tu cuenta, y, si lo tenés, el número de operación de
          Mercado Pago. Con el email de la cuenta alcanza para ubicar tu pago.
        </li>
        <li>
          Te confirmamos por el mismo canal que recibimos el pedido y gestionamos la devolución.
        </li>
      </ol>

      <h2>3. Cómo se te devuelve el dinero</h2>
      <p>
        Hacemos el reembolso a través de Mercado Pago, por el mismo medio de pago que usaste. El
        tiempo en que lo ves acreditado depende de Mercado Pago y de tu banco o tarjeta; nosotros lo
        iniciamos apenas aprobamos el pedido.
      </p>

      <h2>4. Qué pasa con tu acceso</h2>
      <p>
        Cuando se aprueba un reembolso, tu acceso al plan pago se retira de forma automática: apenas
        Mercado Pago confirma la devolución, tu cuenta queda sin el plan pago. Tu cuenta y tus datos
        de registro siguen existiendo, y podés volver a comprar el acceso cuando quieras. Si
        preferís dar de baja la cuenta, pedilo como se explica en la{" "}
        <Link href="/privacidad">Política de Privacidad</Link>.
      </p>
      <p>
        Esto es así porque lo que se compra son contactos y datos operativos que, una vez vistos, no
        se pueden “devolver”: por eso el acceso no se mantiene después de un reembolso.
      </p>

      <h2>5. Otros pedidos y casos particulares</h2>
      <p>
        Si pasaron más de 10 días, o tuviste un problema con tu compra (un cobro duplicado, un cobro
        sin acceso, un error en el monto), escribinos igual: revisamos cada caso y te respondemos
        por el mismo canal. Los cobros duplicados o erróneos los devolvemos siempre.
      </p>
      <p>
        También podés iniciar un reclamo directo desde Mercado Pago. Tené en cuenta que, si el pago
        se revierte, el acceso se retira igual que en cualquier reembolso.
      </p>
    </LegalDocPage>
  );
}
