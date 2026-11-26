// Aviso de que viene un módulo nuevo de videos (importación marítima). Sólo front: no hay
// tabla, endpoint ni campo de admin atrás — cuando el módulo exista se reemplaza por su
// Stage real. Mismo componente en Inicio (a todo el ancho, debajo de las tarjetas de Stage
// 1 y 2) y en Formación (debajo del Stage 2) para que se vea igual en los dos lados. Reusa la fila compacta "Próximamente"
// de <SeccionSlot> (la de Comunidad), sin acción.

import { SeccionSlot } from "./SeccionSlot";

export function ModuloMaritimoProximamente() {
  return (
    <SeccionSlot
      eyebrow="Stage 3"
      titulo="Formación: importación marítima"
      descripcion="Los videos para traer mercadería por barco: costos, tiempos y trámites."
      variante="banner"
      icono="barco"
      proximamente
    />
  );
}
