// "Enviar por WhatsApp" de las calculadoras: el usuario de la plataforma le
// manda lo cotizado a VEGROUP, que es quien opera el envío. El link va directo
// al número de VEGROUP (antes `wa.me/?text=` y el usuario elegía a quién).
//
// Mismo criterio que WHATSAPP_DESPACHANTE (tarifasMaritimo.ts): wa.me quiere el
// número sin "+", sin espacios y sin guiones. NO es `links.whatsapp` de la
// config: ese es el contacto de soporte de OG Circle (Perfil), otro número.
//
// Función pura, sin React: se testea sola (whatsappVegroup.test.ts).

/** +54 9 11 7639-2303, en el formato que pide wa.me. */
export const WHATSAPP_VEGROUP = "5491176392303";

/** El mismo número, legible, para el pie del PDF. */
export const WHATSAPP_VEGROUP_LEGIBLE = "+54 9 11 7639-2303";

/** Link a un chat con VEGROUP con el mensaje ya escrito (el usuario lo puede editar). */
export function linkWhatsappVegroup(texto: string): string {
  return `https://wa.me/${WHATSAPP_VEGROUP}?text=${encodeURIComponent(texto)}`;
}
