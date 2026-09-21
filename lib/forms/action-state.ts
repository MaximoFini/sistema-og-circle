// VGRP-56 punto 1 — sin ninguna dependencia a propósito, separado de los
// `_schemas.ts` de cada route group: esos archivos importan zod y construyen
// schemas con `z.object(...)` a nivel de módulo (llamadas con efecto
// observable para webpack, y los archivos de `app/` no están marcados
// `sideEffects: false`, así que no se pueden eliminar por tree-shaking). Los
// Client Components de formulario (auth: LoginForm/RegistroForm/
// RecuperarForm/NuevaPasswordForm; perfil: PerfilForm) sólo necesitan
// `INITIAL_ACTION_STATE` para `useActionState` — ninguno llama a
// `.safeParse()` (la validación real vive en el server, en cada
// `_actions.ts`) — así que importarlo desde `_schemas.ts` traía Zod entero
// al bundle del cliente en esas rutas para transportar un `{}`.
//
// Compartido entre `app/(auth)/` y `app/(app)/perfil/` porque la forma es
// idéntica en los dos — sin esto quedaban dos copias byte a byte.

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
   * action lo usa: todos redirigen en el camino feliz.
   */
  mensaje?: string;
}

export const INITIAL_ACTION_STATE: ActionState = {};
