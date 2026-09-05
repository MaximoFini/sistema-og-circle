import type { Metadata } from "next";
import { LegalDocPage } from "../LegalDocPage";

export const metadata: Metadata = { title: "Política de Privacidad — OG Circle" };

// VGRP-34 — placeholder de Política de Privacidad. Mismo criterio que
// `/terminos`: texto pendiente de Jota, estructura ya lista, chrome
// compartido vía `../LegalDocPage.tsx`.
export default function PrivacidadPage() {
  return (
    <LegalDocPage title="Política de Privacidad">
      <h2>1. Qué datos recolectamos</h2>
      <p>
        [Placeholder] Datos de registro (nombre, email, teléfono), datos de pago que procesa Mercado
        Pago (OG Circle no almacena números de tarjeta), y datos de uso de la plataforma.
      </p>

      <h2>2. Para qué los usamos</h2>
      <p>
        [Placeholder] Dar acceso al nivel comprado, soporte por WhatsApp con el teléfono provisto,
        emails transaccionales (bienvenida, confirmación de pago, recuperación de contraseña).
      </p>

      <h2>3. Con quién los compartimos</h2>
      <p>
        [Placeholder] Proveedores necesarios para operar el servicio: Mercado Pago (pagos), Supabase
        (base de datos y autenticación), Resend (emails). No se venden datos a terceros.
      </p>

      <h2>4. Tus derechos</h2>
      <p>
        [Placeholder] Acceso, rectificación y baja de la cuenta. Cómo pedirlos (vía soporte por
        WhatsApp, mismo canal que el resto del producto).
      </p>

      <h2>5. Modificaciones</h2>
      <p>
        [Placeholder] Cómo y cuándo puede cambiar este texto, y que la versión aceptada por cada
        usuario queda registrada.
      </p>
    </LegalDocPage>
  );
}
