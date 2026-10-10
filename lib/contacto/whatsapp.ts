// Link "Escribir por WhatsApp" de las tarjetas del directorio (agentes, profesionales).
//
// `contacto` es texto libre que carga el admin ("+86 136 4221 5666", "+54 9 11 3174-6191",
// "wa.me/5491131746191"): se arma el link al mostrarlo, así cada fila nueva lo tiene sin
// pasos extra en el panel. Si el contacto no es un teléfono (un email, un usuario de
// WeChat), no hay link: mejor sin botón que un botón que abre un chat equivocado.

const SOLO_TELEFONO = /^[\d\s()+.-]+$/;
const LINK_WA_ME = /^(?:https?:\/\/)?wa\.me\/(\d+)\/?$/i;

/** Dígitos en formato internacional para wa.me (sin "+"), o null si no es un teléfono. */
export function numeroWhatsapp(contacto: string): string | null {
  const texto = contacto.trim();
  const deLink = LINK_WA_ME.exec(texto);
  const digitos = deLink ? deLink[1] : SOLO_TELEFONO.test(texto) ? texto.replace(/\D/g, "") : "";
  // E.164: hasta 15 dígitos; menos de 8 no es un número internacional completo.
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/** Link a wa.me con un saludo ya escrito (el usuario lo puede editar antes de enviar). */
export function hrefWhatsapp(contacto: string, nombre: string): string | null {
  const numero = numeroWhatsapp(contacto);
  if (!numero) return null;
  const texto = `Hola ${nombre}, te escribo desde OG Circle.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
