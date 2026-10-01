import { nivelAlcanzaOSupera } from "../auth/claims";
import type { NivelAcceso } from "../database.types";

/**
 * Decide si la pantalla de espera post-checkout (`/comprar/pendiente`,
 * `PendienteClient.tsx`) puede dar la compra por confirmada.
 *
 * ---------------------------------------------------------------------------
 * Bug que esta función corrige (auditoría de Mercado Pago)
 * ---------------------------------------------------------------------------
 * La condición anterior era simplemente `nivel !== "ninguno"`. Eso es
 * correcto para alguien que compra desde `nivel = 'ninguno'`, pero es FALSO
 * para un usuario Principiante que compra un upgrade a Avanzado: su nivel YA
 * es distinto de `'ninguno'` ANTES de que el webhook de Mercado Pago (VGRP-23)
 * confirme el pago nuevo. Con la condición vieja, esta pantalla redirigía al
 * dashboard de inmediato, sin haber esperado la confirmación real de la
 * compra de Avanzado.
 *
 * La función compara el nivel ALCANZADO contra el nivel ESPERADO (el que
 * `/comprar` le pasó a esta pantalla por query param, ver `page.tsx`) usando
 * el mismo orden de precedencia que `nivel_vigente()` en la base
 * ('ninguno' < 'principiante' < 'avanzado'): sólo confirma cuando el nivel
 * alcanzado llega, como mínimo, al nivel que se esperaba comprar.
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
