import { Button, Text } from "@react-email/components";
import { EmailLayout, estiloBoton, estiloParrafo, estilosEmail } from "./_layout";

/**
 * Bienvenida (VGRP-26). Se envía al crear la cuenta, aunque todavía no haya pagado:
 * el plan se activa aparte (ver `pago-confirmado.tsx`).
 */

export interface BienvenidaEmailProps {
  nombre: string;
  /** Link al dashboard. */
  url: string;
}

const estiloLista = {
  ...estiloParrafo,
  margin: "0 0 8px 0",
  paddingLeft: "4px",
} as const;

export function BienvenidaEmail({ nombre, url }: BienvenidaEmailProps) {
  return (
    <EmailLayout preview={`Bienvenido a OG Circle, ${nombre}`} titulo={`Hola, ${nombre}`}>
      <Text style={estiloParrafo}>
        Tu cuenta en OG Circle ya está creada. Desde ahora podés entrar cuando quieras y ver todo lo
        que tenés disponible desde tu panel.
      </Text>

      <Text style={{ ...estiloParrafo, margin: "0 0 8px 0" }}>Qué podés hacer ahora:</Text>
      <Text style={estiloLista}>• Entrar a tu panel y revisar el estado de tu cuenta.</Text>
      <Text style={estiloLista}>• Conocer qué incluye el plan antes de decidir.</Text>
      <Text style={{ ...estiloLista, margin: "0 0 20px 0" }}>
        • Activar el plan cuando quieras, desde el mismo panel.
      </Text>

      <Button href={url} style={estiloBoton}>
        Ir a mi panel
      </Button>

      <Text style={{ ...estiloParrafo, margin: "20px 0 0 0", color: estilosEmail.TEXTO_ATENUADO }}>
        Si no creaste esta cuenta, podés ignorar este mail.
      </Text>
    </EmailLayout>
  );
}

export default BienvenidaEmail;
