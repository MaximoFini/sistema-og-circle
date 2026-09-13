// VGRP-32 — lectura de la tabla `profesionales`. Mismo criterio arquitectónico que
// lib/data/agentes.ts (server-only, resuelto desde un Route Handler dinámico, nunca en
// el HTML estático del dashboard), pero SIN gating por nivel: la tabla no tiene
// `nivel_requerido` (decisión confirmada 2026-09-09, VGRP-38) — mismo acceso para
// Principiante y Avanzado. `contacto` sólo se resuelve si hay sesión real (claims no
// nulo); no hay ninguna condición de nivel que evaluar.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppMetadataClaims } from "../auth/claims";
import type { Database } from "../database.types";

type AdminClient = SupabaseClient<Database>;

export interface ProfesionalPublico {
  id: string;
  publicMeta: {
    nombre: string;
    rubro: string;
    descripcion: string | null;
  };
  contacto: string | null;
}

export async function obtenerProfesionales(
  admin: AdminClient,
  claims: AppMetadataClaims | null,
): Promise<ProfesionalPublico[]> {
  const { data, error } = await admin
    .from("profesionales")
    .select("id, nombre, rubro, descripcion, contacto")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((fila) => ({
    id: fila.id,
    publicMeta: {
      nombre: fila.nombre,
      rubro: fila.rubro,
      descripcion: fila.descripcion,
    },
    contacto: claims ? fila.contacto : null,
  }));
}
