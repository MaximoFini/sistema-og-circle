// Encabezado de las dos secciones de Formación de Inicio (Stage 1 y Stage 2).
//
// Fuente única: las usan `InicioShell` (lo que ve el usuario) y el editor de videos del
// admin (`/admin/contenido/videos`), que es una réplica de esas grillas. Si el texto vive
// en un solo lugar, las dos pantallas no pueden divergir. La cantidad sale de
// `CANTIDAD_STAGE`, el mismo número que fija cuántas casillas tiene cada grilla.

import { CANTIDAD_STAGE } from "@/lib/data/videos-config";

export const SECCIONES_FORMACION = {
  1: {
    eyebrow: "Stage 1",
    titulo: "Formación: importaciones",
    descripcion: `${CANTIDAD_STAGE[1]} videos que te llevan de cero a tu primera importación.`,
  },
  2: {
    eyebrow: "Stage 2",
    titulo: "Formación: armá tu tienda",
    descripcion: `${CANTIDAD_STAGE[2]} videos para vender lo que importaste (Tienda Nube, Shopify).`,
  },
} as const;
