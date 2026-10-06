import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO } from "@/lib/legal/contacto";
import { LegalDocPage } from "../LegalDocPage";

export const metadata: Metadata = { title: "Términos y Condiciones — OG Circle" };

// VGRP-34 — texto publicado de Términos y Condiciones (antes, placeholder).
// Redactado a partir de lo que el sistema hace de verdad; pendiente la revisión
// de Jota. Si cambia el código, cambia esto y se sube `TERMINOS_VERSION`
// (lib/legal/version.ts):
// - Plan y pago: un único plan (`getPlan`, `getPrecios` → /comprar), "pago
//   único", cobrado por Mercado Pago; el acceso se activa al confirmarse el
//   pago (webhook de MP → `proyectarNivel`).
// - Reembolso: revoca el acceso solo (`nivel_vigente()`), ver /reembolsos.
// - Registro: exige aceptar Términos y Privacidad (`terminosAceptadosFields`).
// - Datos de agentes, depósitos y SWIFT: contenido restringido al plan pago.
export default function TerminosPage() {
  return (
    <LegalDocPage title="Términos y Condiciones">
      <p>
        Estos términos regulan el uso de OG Circle (la plataforma en plataforma.ogcircle.com.ar y el
        sitio ogcircle.com.ar). Al crear una cuenta, con email y contraseña o con Google, declarás
        que los leíste y que los aceptás, junto con la{" "}
        <Link href="/privacidad">Política de Privacidad</Link>. Si no estás de acuerdo, no uses la
        plataforma.
      </p>

      <h2>1. Qué es OG Circle</h2>
      <p>
        OG Circle es una plataforma de formación y herramientas para importar: videos del proceso de
        importación paso a paso, una calculadora de costos, y acceso a una red de contactos
        operativos (agentes de compra, depósitos, forwarders y datos de pago por SWIFT).
      </p>
      <p>
        Con la cuenta gratuita ves una parte de la plataforma; el acceso completo, incluidos los
        contactos operativos, requiere el plan pago.
      </p>

      <h2>2. Plan, precio y pago</h2>
      <p>
        Hay un único plan pago, con acceso completo a la plataforma. Es un pago único: no hay
        suscripción ni cobros recurrentes. El precio vigente se muestra en la pantalla de compra, en
        pesos argentinos, antes de que pagues.
      </p>
      <p>
        Los pagos los procesa Mercado Pago; OG Circle no recibe ni guarda los datos de tu tarjeta.
        Tu acceso se activa apenas Mercado Pago confirma el pago, y si el pago queda pendiente, se
        activa cuando se acredite.
      </p>
      <p>
        El acceso es de por vida, entendido como el tiempo en que OG Circle esté en funcionamiento.
        Podemos cambiar el precio hacia adelante; eso no afecta a quienes ya pagaron.
      </p>

      <h2>3. Reembolsos</h2>
      <p>
        Cómo pedir un reembolso y qué pasa con tu acceso cuando se aprueba está en la{" "}
        <Link href="/reembolsos">Política de Reembolsos</Link>, que forma parte de estos términos.
      </p>

      <h2>4. Tu cuenta</h2>
      <ul>
        <li>Tenés que ser mayor de 18 años y darnos datos verdaderos al registrarte.</li>
        <li>
          La cuenta es personal e intransferible. Cuidá tu contraseña: lo que se haga desde tu
          cuenta lo consideramos hecho por vos.
        </li>
        <li>
          Si notás un uso no autorizado de tu cuenta, avisanos cuanto antes a{" "}
          <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
        </li>
      </ul>

      <h2>5. Uso permitido del contenido</h2>
      <p>
        El contenido de OG Circle (videos, textos, calculadora, y los datos de contacto de agentes,
        depósitos y SWIFT) es de OG Circle o de quienes nos lo cedieron, y lo accedés para tu uso
        personal. No está permitido:
      </p>
      <ul>
        <li>
          compartir, revender, publicar o copiar el contenido restringido, en especial los contactos
          y los datos de pago, con personas que no hayan pagado su acceso;
        </li>
        <li>compartir tu cuenta o dar acceso a otras personas con tus credenciales;</li>
        <li>
          usar procesos automáticos para extraer contenido de la plataforma, ni intentar acceder a
          partes que tu nivel no incluye.
        </li>
      </ul>
      <p>
        Si detectamos un uso así, podemos suspender o dar de baja la cuenta, sin que corresponda
        reembolso por el acceso perdido.
      </p>

      <h2>6. Información de terceros y alcance del servicio</h2>
      <p>
        Los datos de agentes de compra, depósitos, forwarders y SWIFT, y los valores de la
        calculadora (tarifas, impuestos, tipos de cambio), son información que reunimos de terceros
        y que puede cambiar sin aviso. Hacemos lo posible para mantenerla al día y para que los
        contactos sean confiables, pero:
      </p>
      <ul>
        <li>
          OG Circle facilita el acceso y la información; no es parte de las operaciones que hagas
          con esos terceros y no garantiza su resultado, sus precios ni sus plazos.
        </li>
        <li>
          Los cálculos de la calculadora son estimaciones para decidir mejor, no una cotización
          oficial ni asesoramiento aduanero, impositivo o legal. Verificá los valores antes de
          comprar, importar o pagar.
        </li>
        <li>
          Los resultados de tu negocio dependen de tus decisiones; no prometemos ganancias ni
          resultados determinados.
        </li>
      </ul>

      <h2>7. Disponibilidad</h2>
      <p>
        Trabajamos para que la plataforma esté disponible todo el tiempo, pero puede haber
        interrupciones por mantenimiento o por fallas de nuestros proveedores. Podemos mejorar,
        cambiar o reordenar funciones y contenidos, sin reducir de forma sustancial lo que incluye
        el plan que compraste.
      </p>

      <h2>8. Cambios en estos términos</h2>
      <p>
        Podemos actualizar estos términos. Publicamos la versión nueva en esta página, con su fecha
        de versión, y la versión que aceptó cada usuario queda registrada en su cuenta. Si el cambio
        es importante, te avisamos por la plataforma o por email.
      </p>

      <h2>9. Ley aplicable y contacto</h2>
      <p>
        Estos términos se rigen por las leyes de la República Argentina, incluida la Ley de Defensa
        del Consumidor Nº 24.240. Si sos consumidor, podés iniciar cualquier reclamo ante los
        tribunales de tu domicilio. Para consultas, escribinos a{" "}
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a> o al WhatsApp de soporte que figura en la
        plataforma.
      </p>
    </LegalDocPage>
  );
}
