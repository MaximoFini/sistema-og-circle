"use client";

import dynamic from "next/dynamic";

// VGRP-88 — el form de materiales (con el subidor por XHR) se descarga solo cuando la entidad
// es `materiales`: `/admin/contenido/[entidad]` ya estaba por arriba del presupuesto de First
// Load JS (docs/RENDIMIENTO.md), así que no puede sumarle peso al resto de las entidades.
// Mismo motivo que ListadoReordenableLazy: el `dynamic()` vive en un Client Component.
export const MaterialForm = dynamic(() => import("./MaterialForm").then((m) => m.MaterialForm));
