import { nivelAlcanzaOSupera } from "../auth/claims";
import type { NivelAcceso } from "../database.types";

/**
 * Decide si la pantalla de espera post-checkout (`/comprar/pendiente`,
 * `PendienteClient.tsx`) puede dar la compra por confirmada.
 *
 * Auditoría de Mercado Pago: la condición vieja era `nivel !== "ninguno"`,
 * que con dos niveles confirmaba un upgrade (Principiante → Avanzado) antes
 * de que el webhook proyectara el pago nuevo. Con el plan único
 * (VGRP-59/60) ese upgrade ya no existe, pero se mantiene la comparación
 * contra el nivel ESPERADO (el query param `nivel` que `/comprar` le pasa
 * a esta pantalla) con el mismo orden que `nivel_vigente()`: confirma
 * recién cuando el nivel alcanzado llega, como mínimo, al esperado.
 *
 * `nivelEsperado` puede ser `null` (el query param faltaba o venía con un
 * valor inesperado — ver `esNivelAcceso()` en `page.tsx`): en ese caso se
 * conserva el comportamiento histórico de "cualquier nivel distinto de
 * 'ninguno' confirma", porque no hay con qué nivel comparar.
 */
export function compraFueConfirmada(
  nivelActual: NivelAcceso,
  nivelEsperado: NivelAcceso | null,
): boolean {
  return nivelEsperado
    ? nivelAlcanzaOSupera(nivelActual, nivelEsperado)
    : nivelActual !== "ninguno";
}
