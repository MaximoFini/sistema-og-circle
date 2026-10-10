import { FormacionBloqueado } from "@/components/formacion/FormacionBloqueado";
import { FormacionShell } from "@/components/formacion/FormacionShell";
import { tieneAcceso } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";

// =============================================================================
// VGRP-88 — /formacion, gateado por nivel.
//
// Red de contención: en el camino normal `middleware.ts` reescribe `/formacion` a la
// variante estática (`[variante]/page.tsx`) y esta página no se renderiza. Existe por si
// algún request llegara sin pasar por ese rewrite. Renderiza lo mismo que la variante
// estática de cada nivel, así no quedan dos versiones distintas (igual que
// `app/(app)/dashboard/page.tsx`).
//
// Este page.tsx SÍ puede leer `getVerifiedClaims()` (a diferencia del layout de `(app)`):
// es contenido por-usuario de una página puntual, no el shell compartido.
// =============================================================================
export default async function FormacionPage() {
  const claims = await getVerifiedClaims();
  return tieneAcceso(claims) ? <FormacionShell /> : <FormacionBloqueado />;
}
