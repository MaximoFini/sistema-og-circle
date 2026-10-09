"use client";

import dynamic from "next/dynamic";

// El `dynamic()` tiene que vivir en un Client Component: desde un Server Component, Next
// deja igual el chunk de `@dnd-kit` en el First Load JS de la ruta. Medición y motivo en
// docs/RENDIMIENTO.md ("/admin/contenido/[entidad]").
export const ListadoReordenable = dynamic(() =>
  import("./ListadoReordenable").then((m) => m.ListadoReordenable),
);
