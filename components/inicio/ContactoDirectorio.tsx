// Pie de las tarjetas del directorio (agentes, profesionales): el contacto escrito (para
// copiarlo o llamar) y, si es un teléfono, el botón para abrir el chat de WhatsApp con un
// saludo ya escrito. Sin "use client": lo renderizan las grillas, que ya son de cliente.

import { Icon } from "@/components/ui/Icon";
import { hrefWhatsapp } from "@/lib/contacto/whatsapp";
import styles from "./inicio.module.css";

export function ContactoDirectorio({ contacto, nombre }: { contacto: string; nombre: string }) {
  const href = hrefWhatsapp(contacto, nombre);

  return (
    <div className={styles.contactoBloque}>
      <p className={styles.contacto}>{contacto}</p>
      {href ? (
        // <a> con las clases de Button (no un <button>): navega a otro sitio, no ejecuta
        // una acción. Mismo criterio que el CTA de ContenidoBloqueado.
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.ctaWhatsapp}
          aria-label={`Escribirle a ${nombre} por WhatsApp`}
        >
          <Icon name="chat" size={16} />
          Escribir por WhatsApp
        </a>
      ) : null}
    </div>
  );
}
