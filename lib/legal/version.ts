// VGRP-34 — versión del texto legal vigente.
//
// Los textos de Términos, Privacidad y Reembolsos de `app/(legal)/` están
// publicados y pendientes de la revisión de Jota (PRD Fase 2 §8). Este identificador es lo que queda guardado
// en `profiles.terminos_version` cuando alguien se registra (ver
// `terminosAceptadosFields()` en `./aceptacion.ts`), así que sirve para
// saber después qué versión aceptó cada usuario si el texto cambia.
//
// Bump manual cuando Jota entregue el texto definitivo, o cuando se edite
// una de las tres páginas de forma sustantiva (no un typo).
//
// 2026-10-05 (VGRP-78): se publicó el texto de Privacidad (requisito de la
// verificación de marca de Google OAuth).
// 2026-10-06 (VGRP-34): se publicaron los textos de Términos y Reembolsos y
// se sacó el aviso de placeholder. Pendiente la revisión de Jota. El
// identificador es del conjunto aceptado, no de un documento (las tres
// páginas lo muestran).
export const TERMINOS_VERSION = "2026-10-06";
