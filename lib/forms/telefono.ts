// VGRP-78 — la regla del teléfono de contacto, en un solo lugar. Sin
// dependencias a propósito (mismo criterio que `action-state.ts`): los
// schemas Zod de registro y perfil la usan en `.min()`/`.max()`, y
// `ComprarButton` (Client Component) la importa para habilitar el botón sin
// traer Zod al bundle del cliente.

export const TELEFONO_MIN = 6;
export const TELEFONO_MAX = 30;

export function telefonoValido(valor: string): boolean {
  const largo = valor.trim().length;
  return largo >= TELEFONO_MIN && largo <= TELEFONO_MAX;
}
