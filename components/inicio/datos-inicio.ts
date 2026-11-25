// Qué pide Inicio después de hidratar, en un solo lugar: lo usan las grillas (para leer)
// y la navegación (para precargar al pasar el puntero por "Inicio"). Misma clave = mismo
// dato en lib/cliente/cache-datos.ts.

import { obtenerProgresoVideos } from "@/components/video/_actions";
import { pedirJson, precargar } from "@/lib/cliente/cache-datos";

export const DATOS_INICIO = {
  agentes: "/api/agentes",
  profesionales: "/api/profesionales",
  servicios: "/api/servicios-financieros",
} as const;

/** Progreso de videos: lo comparten Inicio (tarjetas de Stage) y Formación. */
export const CLAVE_PROGRESO = "progreso-videos";

export const cargarProgreso = () => obtenerProgresoVideos();

/** Deja en memoria todo lo de Inicio. Sin efecto si ya está fresco o en camino. */
export function precargarInicio() {
  for (const url of Object.values(DATOS_INICIO)) void precargar(url, () => pedirJson(url));
  void precargar(CLAVE_PROGRESO, cargarProgreso);
}
