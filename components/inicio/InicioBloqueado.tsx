// VGRP-77 — Inicio de quien no tiene plan: el Inicio real, borroso e inerte,
// con la tarjeta de desbloqueo encima. Lo usan las dos páginas de `/dashboard`
// (la variante estática `ninguno` y la red de contención sin rewrite), así no
// quedan dos versiones distintas.

import { ComprarButton } from "@/app/(app)/comprar/ComprarButton";
import { TarjetaDesbloqueo } from "@/components/ui/TarjetaDesbloqueo";
import { getOfertaPlan } from "@/lib/config";
import { InicioShell } from "./InicioShell";

export async function InicioBloqueado() {
  const { nombre, precio } = await getOfertaPlan();
  return (
    <TarjetaDesbloqueo
      nombrePlan={nombre}
      precio={precio}
      accion={<ComprarButton nivel="completo" />}
    >
      <InicioShell bloqueado />
    </TarjetaDesbloqueo>
  );
}
