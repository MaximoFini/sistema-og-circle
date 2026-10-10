// Encabezado de las dos secciones de Formación (Stage 1 y Stage 2).
//
// Fuente única: las usan /formacion (lo que ve el usuario) y el editor de videos del admin
// (`/admin/contenido/videos`), que es una réplica de esas grillas. Si el texto vive en un
// solo lugar, las dos pantallas no pueden divergir. Sin cantidad en la descripción: los
// stages no tienen tope de videos (VGRP-88).

export const SECCIONES_FORMACION = {
  1: {
    eyebrow: "Stage 1",
    titulo: "Formación: importaciones",
    descripcion: "Los videos que te llevan de cero a tu primera importación.",
  },
  2: {
    eyebrow: "Stage 2",
    titulo: "Formación: armá tu tienda",
    descripcion: "Los videos para vender lo que importaste (Tienda Nube, Shopify).",
  },
} as const;
