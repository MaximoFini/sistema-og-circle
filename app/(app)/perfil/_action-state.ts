// VGRP-56 punto 1 — separado de `_schemas.ts` a propósito, mismo motivo que
// `app/(auth)/_action-state.ts`: ese archivo importa Zod a nivel de módulo
// (no eliminable por tree-shaking), y `PerfilForm.tsx` sólo necesita
// `INITIAL_ACTION_STATE` para `useActionState` — nunca llama a
// `.safeParse()` (la validación real vive en `_actions.ts`, en el server).

export interface ActionState {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  mensaje?: string;
}

export const INITIAL_ACTION_STATE: ActionState = {};
