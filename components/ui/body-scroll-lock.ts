// Bloqueo de scroll del <body> con CONTADOR: dos paneles abiertos a la vez no se pisan.
//
// El patrón "guardar el overflow previo y restaurarlo al cerrar" (que usaban NavDrawer,
// CerrarSesionBoton y DatosModal) es frágil: si dos se solapan y se cierran en un orden
// distinto al de apertura, el que cierra último restaura "hidden" y el scroll queda
// trabado en todas las páginas hasta recargar. Pasaba de verdad: el diálogo de "Cerrar
// sesión" se abre desde el menú, y al desmontarse los dos juntos React limpia primero el
// padre (menú) y después el hijo (diálogo). Con un contador, el bloqueo se levanta recién
// cuando se cierra el ÚLTIMO, en cualquier orden.
//
// Lógica pura y sin React para poder testearla sin DOM (los tests del repo corren en
// `node`). El hook que la usa está en `useBodyScrollLock.ts`.

export interface CuerpoConEstilo {
  style: { overflow: string };
}

let bloqueos = 0;
let overflowOriginal = "";

/** Bloquea el scroll. Devuelve una función que lo libera (idempotente por llamada). */
export function bloquearScroll(body: CuerpoConEstilo): () => void {
  if (bloqueos === 0) {
    overflowOriginal = body.style.overflow;
    body.style.overflow = "hidden";
  }
  bloqueos += 1;

  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    bloqueos -= 1;
    if (bloqueos === 0) body.style.overflow = overflowOriginal;
  };
}

/** Sólo para tests: vuelve el contador a cero. */
export function _reiniciarBloqueosParaTests(): void {
  bloqueos = 0;
  overflowOriginal = "";
}
