import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, estiloBoton, estiloParrafo, estilosEmail } from "./_layout";

/**
 * Email de recuperación de contraseña (VGRP-25) — primera plantilla real.
 *
 * Se renderiza desde `app/api/auth/send-email/route.ts` cuando Supabase Auth
 * dispara el Send Email Hook con `email_action_type: "recovery"`.
 *
 * Decisiones de contenido:
 *
 * - **El link va también como texto plano visible.** Los clientes que bloquean
 *   contenido remoto suelen romper o esconder el botón; además hay gente que
 *   copia y pega. El `<Button>` de React Email es un `<a>` estilado, no una
 *   imagen, así que sobrevive — pero igual se repite la URL abajo.
 * - **Se incluye el código de 6 dígitos** cuando Supabase lo manda. Es el camino
 *   alternativo si el link se rompe al pasar por un escáner de links corporativo
 *   (algo bastante común: el escáner "visita" el link y consume el token de un
 *   solo uso antes que la persona).
 * - **Se dice explícitamente qué hacer si no fuiste vos.** Un mail de reset que
 *   no explica eso entrena a la gente a ignorar los intentos de acceso ajenos.
 */

export interface ResetPasswordEmailProps {
  /** URL de un solo uso que confirma el reset y lleva a poner la contraseña nueva. */
  url: string;
  /** Código OTP de 6 dígitos que manda Supabase junto al link. Opcional. */
  codigo?: string;
}

const estiloCodigo = {
  backgroundColor: estilosEmail.BG,
  border: `1px solid ${estilosEmail.BORDE}`,
  borderRadius: "8px",
  color: estilosEmail.CHAMPAGNE,
  fontFamily: estilosEmail.FUENTE_HEADING,
  fontSize: "22px",
  fontWeight: 700,
  letterSpacing: "0.2em",
  margin: "0 0 20px 0",
  padding: "14px 16px",
  textAlign: "center",
} as const;

const estiloUrlCruda = {
  ...estiloParrafo,
  color: estilosEmail.TEXTO_ATENUADO,
  fontSize: "12px",
  // Una URL de reset es larga y no tiene espacios: sin esto desborda el
  // contenedor y rompe el layout en mobile.
  wordBreak: "break-all",
} as const;

export function ResetPasswordEmail({ url, codigo }: ResetPasswordEmailProps) {
  return (
    <EmailLayout preview="Restablecé tu contraseña de OG Circle" titulo="Restablecé tu contraseña">
      <Text style={estiloParrafo}>
        Alguien pidió restablecer la contraseña de tu cuenta de OG Circle. Si fuiste vos, tocá el
        botón para elegir una nueva.
      </Text>

      <Button href={url} style={estiloBoton}>
        Elegir contraseña nueva
      </Button>

      <Text style={{ ...estiloParrafo, margin: "20px 0 8px 0" }}>
        Si el botón no funciona, copiá y pegá este link en el navegador:
      </Text>
      <Text style={estiloUrlCruda}>
        <Link href={url} style={{ color: estilosEmail.TEXTO_ATENUADO }}>
          {url}
        </Link>
      </Text>

      {codigo ? (
        <>
          <Text style={{ ...estiloParrafo, margin: "16px 0 8px 0" }}>
            También podés usar este código:
          </Text>
          <Text style={estiloCodigo}>{codigo}</Text>
        </>
      ) : null}

      <Text style={{ ...estiloParrafo, margin: "0" }}>
        El link y el código vencen en una hora y sirven una sola vez. Si no pediste esto, ignorá el
        mail: tu contraseña actual sigue funcionando.
      </Text>
    </EmailLayout>
  );
}

export default ResetPasswordEmail;
