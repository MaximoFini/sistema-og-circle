import type { Metadata } from "next";
import { CONTACTO } from "@/lib/legal/contacto";
import { LegalDocPage } from "../LegalDocPage";

export const metadata: Metadata = { title: "Política de Privacidad — OG Circle" };

// VGRP-78 — texto publicado de la Política de Privacidad (antes, placeholder
// de VGRP-34). Google lo exige completo para verificar la marca de la
// pantalla de "Continuar con Google", incluida la sección de datos de Google.
// Redactado a partir del código y publicado por decisión de Máximo
// (2026-10-05); pendiente la revisión de Jota.
//
// Cada afirmación sale del sistema real — si cambia el código, cambia esto y
// se sube `TERMINOS_VERSION` (lib/legal/version.ts):
// - Datos de la cuenta: columnas de `profiles` (init_plataforma.sql +
//   terminos_aceptados, profiles_origen_registro). Contraseñas: Supabase Auth.
// - Google: `continuarConGoogle` (app/(auth)/_actions.ts) no pasa scopes, así
//   que Supabase pide los suyos por defecto: `email profile` (verificado en la
//   URL real de Google, 2026-10-05). Del perfil sólo se usa el nombre
//   (app/auth/callback/google/route.ts).
// - Pagos: tabla `pagos` (sin datos de tarjeta; Checkout Pro de MP).
// - Calculadora: lo cargado no se inserta en ninguna tabla (lib/cotizador,
//   app/api/cotizador); las rutas con IA llaman a Anthropic
//   (lib/cotizador/server/anthropic.ts).
// - Proveedores: package.json (@supabase, @vercel/analytics + speed-insights,
//   mercadopago, resend, @sentry/nextjs con sendDefaultPii:false, Anthropic).
// - Cookies: sesión de Supabase y `og_origen` de 30 días (middleware.ts).
// - Contacto: el email de asistencia cargado en la pantalla de consentimiento
//   de Google Cloud (proyecto og-circle).

export default function PrivacidadPage() {
  return (
    <LegalDocPage title="Política de Privacidad">
      <p>
        Esta política explica qué datos personales recolecta OG Circle (la plataforma en
        plataforma.ogcircle.com.ar y el sitio ogcircle.com.ar), para qué los usa, con quién los
        comparte y qué derechos tenés sobre ellos. Al crear una cuenta, sea con email y contraseña o
        con Google, aceptás esta política.
      </p>

      <h2>1. Responsable de los datos</h2>
      <p>
        El responsable del tratamiento de tus datos es OG Circle. Para cualquier consulta sobre tus
        datos o sobre esta política podés escribirnos a{" "}
        <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a> o al WhatsApp de soporte que figura en la
        plataforma.
      </p>

      <h2>2. Qué datos recolectamos</h2>
      <p>
        <strong>Datos de tu cuenta.</strong> Nombre, email y teléfono de contacto. Si te registrás
        con email, también una contraseña, que se guarda cifrada: nadie del equipo puede verla. Si
        entrás con Google, no te pedimos el teléfono al registrarte sino antes de pagar.
      </p>
      <p>
        <strong>Datos de tu cuenta de Google</strong>, sólo si elegís &quot;Continuar con
        Google&quot;: ver la sección 3.
      </p>
      <p>
        <strong>Datos de pago.</strong> Los pagos los procesa Mercado Pago. OG Circle no recibe ni
        guarda números de tarjeta ni datos bancarios: sólo el identificador del pago, el monto, el
        estado (aprobado, pendiente, reembolsado) y la fecha, para darte acceso y para nuestra
        contabilidad.
      </p>
      <p>
        <strong>Datos de uso de la plataforma.</strong> Tu nivel de acceso, tu progreso en los
        videos, la fecha y la versión de los Términos y de esta política que aceptaste, y desde qué
        enlace del sitio llegaste a registrarte (por ejemplo, un botón de la página principal).
      </p>
      <p>
        <strong>Lo que cargás en la calculadora.</strong> Descripciones de productos, valores y, si
        los subís, documentos como facturas comerciales. Se usan sólo para hacer el cálculo que
        pediste y no los guardamos en nuestra base de datos.
      </p>
      <p>
        <strong>Datos técnicos.</strong> Métricas de visitas y de rendimiento de las páginas y
        registros de errores para poder corregirlos, configurados para no incluir tus datos
        personales.
      </p>

      <h2>3. Datos de tu cuenta de Google</h2>
      <p>
        Si iniciás sesión con Google, le pedimos a Google sólo los permisos <code>email</code> y{" "}
        <code>profile</code>: tu dirección de email y tu información básica de perfil (nombre y foto
        de perfil). No tenemos acceso a tu Gmail, tus contactos, tu Drive, tu calendario ni a ningún
        otro dato o servicio de tu cuenta de Google.
      </p>
      <p>Usamos esos datos sólo para:</p>
      <ul>
        <li>crear tu cuenta de OG Circle e identificarte cada vez que entrás;</li>
        <li>completar tu nombre en el perfil (la foto no la usamos);</li>
        <li>
          vincular tu acceso con Google a una cuenta que ya tengas con el mismo email, para que no
          quedes con dos cuentas;
        </li>
        <li>enviarte los emails de la plataforma (bienvenida, confirmación de pago, soporte).</li>
      </ul>
      <p>
        No vendemos los datos de tu cuenta de Google, no los usamos para publicidad, no los
        compartimos con terceros salvo los proveedores que necesitamos para operar la plataforma
        (sección 5) y no los usamos para entrenar modelos de inteligencia artificial. El uso que OG
        Circle hace de la información recibida de las APIs de Google cumple con la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Política de Datos del Usuario de los Servicios de API de Google
        </a>
        , incluidos los requisitos de Uso Limitado.
      </p>
      <p>
        Podés quitarle a OG Circle el acceso a tu cuenta de Google cuando quieras desde{" "}
        <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
        Para borrar también los datos que ya guardamos, pedinos la baja de la cuenta (sección 9).
      </p>

      <h2>4. Para qué usamos tus datos</h2>
      <ul>
        <li>Darte acceso a la plataforma y al plan que compraste.</li>
        <li>Procesar tus pagos y, si corresponde, tus reembolsos.</li>
        <li>
          Contactarte por tu compra y darte soporte, por WhatsApp o email, con el teléfono y el
          email que nos diste.
        </li>
        <li>
          Enviarte emails transaccionales: bienvenida, confirmación de pago y recuperación de
          contraseña. No te mandamos publicidad.
        </li>
        <li>Hacer los cálculos que pedís en la calculadora.</li>
        <li>Medir qué canales traen registros y mejorar la plataforma.</li>
        <li>Cumplir con nuestras obligaciones legales y fiscales.</li>
      </ul>

      <h2>5. Con quién los compartimos</h2>
      <p>
        No vendemos ni alquilamos tus datos. Los compartimos sólo con los proveedores que
        necesitamos para que la plataforma funcione, y cada uno recibe lo necesario para su parte:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong>: base de datos y autenticación.
        </li>
        <li>
          <strong>Vercel</strong>: hosting de la plataforma y métricas de visitas y rendimiento.
        </li>
        <li>
          <strong>Mercado Pago</strong>: procesamiento de pagos.
        </li>
        <li>
          <strong>Resend</strong>: envío de los emails de la plataforma.
        </li>
        <li>
          <strong>Sentry</strong>: registro de errores técnicos.
        </li>
        <li>
          <strong>Anthropic</strong>: procesa con inteligencia artificial las descripciones de
          productos, los documentos y las fotos de productos que cargás en las funciones de la
          calculadora que la usan. Las fotos no se guardan: sólo se analizan.
        </li>
        <li>
          <strong>Google</strong>: inicio de sesión con Google, si lo elegís.
        </li>
      </ul>
      <p>También podemos compartir datos si una autoridad competente lo exige conforme a la ley.</p>
      <p>
        Algunos de estos proveedores procesan los datos en servidores fuera de Argentina (por
        ejemplo, en Estados Unidos).
      </p>

      <h2>6. Cookies</h2>
      <p>
        Usamos sólo cookies necesarias: las de sesión, para mantenerte logueado, y una cookie que
        recuerda durante 30 días desde qué enlace llegaste a registrarte. No usamos cookies de
        publicidad.
      </p>

      <h2>7. Cuánto tiempo los guardamos</h2>
      <p>
        Guardamos los datos de tu cuenta mientras la tengas activa. Si pedís la baja, los borramos,
        salvo los registros de pagos, que conservamos por el plazo que exigen las normas fiscales y
        contables.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        La comunicación con la plataforma viaja cifrada (HTTPS), las contraseñas se guardan cifradas
        y el acceso a los datos está restringido: cada usuario sólo puede ver su propia información,
        y sólo el equipo de administración accede a los datos necesarios para dar soporte.
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Podés pedir en cualquier momento acceder a tus datos, corregirlos, actualizarlos o borrarlos
        (dar de baja tu cuenta), escribiéndonos a <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. Tu
        nombre y tu teléfono también los podés editar desde tu Perfil.
      </p>
      <p>
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
        mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
        interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº
        25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control
        de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan
        quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en
        materia de protección de datos personales.
      </p>

      <h2>10. Menores de edad</h2>
      <p>
        OG Circle está pensada para personas mayores de 18 años. No recolectamos a sabiendas datos
        de menores de edad.
      </p>

      <h2>11. Cambios a esta política</h2>
      <p>
        Si cambiamos esta política, publicamos la versión nueva en esta página con su fecha de
        versión. La versión que aceptó cada usuario queda registrada en su cuenta.
      </p>
    </LegalDocPage>
  );
}
