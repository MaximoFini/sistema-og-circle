// VGRP-27 — fuente única de los 5 destinos de navegación (MODULOS.md §8).
// Sin lógica: sólo datos. El drawer los recorre para renderizar; cualquier
// otro lugar que necesite la misma lista (footer, breadcrumb futuro) importa
// de acá en vez de duplicarla.

export interface DestinoNav {
  href: string;
  label: string;
  /**
   * Destino de una fase futura (Comunidad = Fase 4, Tracking = Fase 3 —
   * CONTEXT.md, Roadmap). Se muestra visible con badge "Próximamente", nunca
   * como link roto ni oculto sin explicación (regla dura del PRD §2.1).
   */
  proximamente?: true;
}

// NOTA: el ticket (VGRP-27) sólo pide "próximamente" para Comunidad y
// Tracking (Fase 3/4 — fuera de alcance incluso de la Fase 2 completa). Perfil
// SÍ es alcance de Fase 2 (PRD §2.1) pero su pantalla todavía no está
// construida en este repo — no es parte de los 4 tickets de este bloque. Hoy
// navega a un 404 real de Next hasta que su propio ticket la construya; no se
// agrega acá un "próximamente" que el ticket no pidió (evitar scope creep).
export const DESTINOS_NAV: readonly DestinoNav[] = [
  { href: "/dashboard", label: "Inicio" },
  { href: "https://vegroup.vercel.app/calculadora", label: "Calculadora" },
  { href: "/comunidad", label: "Comunidad", proximamente: true },
  { href: "/tracking", label: "Tracking", proximamente: true },
  { href: "/perfil", label: "Perfil" },
] as const;
