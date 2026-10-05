import { Button, Link, Text } from "@react-email/components";
import { EmailLayout, estiloBoton, estiloParrafo, estilosEmail } from "./_layout";

/**
 * Plantilla genérica para los flujos de Supabase Auth `signup`, `magiclink`,
 * `invite` y `email_change`. El hook elige título, texto y CTA por tipo.
 */

export interface AuthGenericoEmailProps {
  titulo: string;
  texto: string;
  cta: string;
  /** Link de un solo uso que dispara la acción. */
  url: string;
}

const estiloUrlCruda = {
  ...estiloParrafo,
  color: estilosEmail.TEXTO_ATENUADO,
  fontSize: "12px",
  wordBreak: "break-all",
} as const;

export function AuthGenericoEmail({ titulo, texto, cta, url }: AuthGenericoEmailProps) {
  return (
    <EmailLayout preview={titulo} titulo={titulo}>
      <Text style={estiloParrafo}>{texto}</Text>

      <Button href={url} style={estiloBoton}>
        {cta}
      </Button>

      <Text style={{ ...estiloParrafo, margin: "20px 0 8px 0" }}>
        Si el botón no funciona, copiá y pegá este link en el navegador:
      </Text>
      <Text style={estiloUrlCruda}>
        <Link href={url} style={{ color: estilosEmail.TEXTO_ATENUADO }}>
          {url}
        </Link>
      </Text>

      <Text style={{ ...estiloParrafo, margin: "0" }}>
        El link vence en una hora y sirve una sola vez. Si no pediste esto, ignorá el mail.
      </Text>
    </EmailLayout>
  );
}

export default AuthGenericoEmail;
