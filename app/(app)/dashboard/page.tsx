import { InicioBloqueado } from "@/components/inicio/InicioBloqueado";
import { InicioShell } from "@/components/inicio/InicioShell";
import { tieneAcceso } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";

// =============================================================================
// VGRP-18 — Dashboard, gateado por nivel.
//
// Red de contención: en el camino normal `middleware.ts` reescribe `/dashboard`
// a la variante estática (`[variante]/page.tsx`) y esta página no se renderiza.
// Existe por si algún request llegara sin pasar por ese rewrite.
//
// VGRP-77: renderiza lo mismo que la variante estática de cada nivel, así no
// quedan dos versiones distintas del Inicio.
//
// Este page.tsx SÍ puede leer `getVerifiedClaims()` (a diferencia del layout
// de `(app)`, ver el comentario de ese archivo): es contenido por-usuario de
// una página puntual, no el shell compartido.
// =============================================================================
export default async function DashboardPage() {
  const claims = await getVerifiedClaims();
  return tieneAcceso(claims) ? <InicioShell /> : <InicioBloqueado />;
}
