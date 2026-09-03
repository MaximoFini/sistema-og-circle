// VGRP-34 — versión del texto legal vigente.
//
// El texto real de Términos, Privacidad y Reembolsos lo entrega Jota (PRD
// Fase 2 §8): hasta que llegue, las tres páginas de `app/(legal)/` muestran
// placeholder marcado como tal. Este identificador es lo que queda guardado
// en `profiles.terminos_version` cuando alguien se registra (ver
// `terminosAceptadosFields()` en `./aceptacion.ts`), así que sirve para
// saber después qué versión aceptó cada usuario si el texto cambia.
//
// Bump manual cuando Jota entregue el texto definitivo, o cuando se edite
// una de las tres páginas de forma sustantiva (no un typo).
export const TERMINOS_VERSION = "2026-09-02-placeholder";
