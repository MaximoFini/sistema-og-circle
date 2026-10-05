import { Button, Text } from "@react-email/components";
import { EmailLayout, estiloBoton, estiloParrafo, estilosEmail } from "./_layout";

/**
 * Confirmación de pago (VGRP-26). El producto tiene un único plan: no hay niveles.
 * No incluye contactos de agentes ni datos SWIFT.
 */

export interface PagoConfirmadoEmailProps {
  nombre: string;
  montoArs: number;
  /** Referencia del pago (la que ve la persona en su comprobante). */
  referencia: string;
  /** Link al dashboard. */
  url: string;
}

const formatearArs = (monto: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);

const estiloDato = {
  ...estiloParrafo,
  color: estilosEmail.TEXTO_PRIMARIO,
  margin: "0 0 8px 0",
} as const;

export function PagoConfirmadoEmail({
  nombre,
  montoArs,
  referencia,
  url,
}: PagoConfirmadoEmailProps) {
  return (
    <EmailLayout preview="Plan activado: ya tenés acceso a OG Circle" titulo="Plan activado">
      <Text style={estiloParrafo}>
        Hola, {nombre}. Recibimos tu pago y tu plan de OG Circle ya está activo.
      </Text>

      <Text style={estiloDato}>
        <span style={{ color: estilosEmail.TEXTO_SECUNDARIO }}>Monto pagado: </span>
        {formatearArs(montoArs)}
      </Text>
      <Text style={{ ...estiloDato, margin: "0 0 24px 0" }}>
        <span style={{ color: estilosEmail.TEXTO_SECUNDARIO }}>Referencia: </span>
        {referencia}
      </Text>

      <Button href={url} style={estiloBoton}>
        Ir a mi panel
      </Button>
    </EmailLayout>
  );
}

export default PagoConfirmadoEmail;
