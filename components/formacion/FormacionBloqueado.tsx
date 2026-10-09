// VGRP-88 — /formacion de quien no tiene plan: la pantalla real, borrosa e inerte, con la
// tarjeta de desbloqueo encima y el botón que cobra directo (VGRP-78). Mismo patrón que
// `InicioBloqueado` (VGRP-77): lo usan la variante estática `ninguno` y la red de
// contención sin rewrite, así no quedan dos versiones distintas.

import { ComprarButton } from "@/app/(app)/comprar/ComprarButton";
import { TarjetaDesbloqueo } from "@/components/ui/TarjetaDesbloqueo";
import { getOfertaPlan } from "@/lib/config";
import { FormacionShell } from "./FormacionShell";

export async function FormacionBloqueado() {
  const { nombre, precio } = await getOfertaPlan();
  return (
    <TarjetaDesbloqueo
      nombrePlan={nombre}
      precio={precio}
      accion={<ComprarButton nivel="completo" />}
    >
      <FormacionShell bloqueado />
    </TarjetaDesbloqueo>
  );
}
