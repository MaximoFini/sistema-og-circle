// VGRP-56 punto 1 — separado de `_schemas.ts` a propósito. Ese archivo
// importa zod y construye schemas con `z.object(...)` a nivel de módulo:
// llamadas con efecto observable para webpack, y los archivos de `app/` no
// están marcados `sideEffects: false`, así que no se pueden eliminar por
// tree-shaking. Los 5 Client Components de formulario (LoginForm,
// RegistroForm, RecuperarForm, NuevaPasswordForm, PerfilForm) sólo necesitan
// `INITIAL_ACTION_STATE` para `useActionState` — ninguno llama a
// `.safeParse()` (la validación real vive en el server, en `_actions.ts`) —
// así que importarlo desde `_schemas.ts` traía Zod entero al bundle del
// cliente en esas 5 rutas para transportar un `{}`.

export interface ActionState {
  /** Error a nivel formulario (credenciales inválidas, cuenta no creada, etc.). */
  error?: string;
  /**
   * Errores por campo, keyeados por nombre de input. Forma de
   * `flattenError().fieldErrors` de Zod: un array por campo (puede haber más
   * de un mensaje por campo), el form sólo muestra el primero.
   */
  fieldErrors?: Partial<Record<string, string[]>>;
  /**
   * Mensaje de éxito a nivel formulario. Hoy sólo lo usa `solicitarReset`:
   * el form de "olvidaste tu contraseña" no redirige a otra pantalla al
   * terminar (no hay a dónde ir todavía — el usuario sigue esperando el
   * mail), así que necesita mostrar la confirmación en el lugar. Ningún otro
   * action de este archivo lo usa: todos redirigen en el camino feliz.
   */
  mensaje?: string;
}

export const INITIAL_ACTION_STATE: ActionState = {};
