// Lectura de un JSON que todavía se está escribiendo (streaming del análisis
// de marketing): con el texto recibido hasta ahora, devuelve el objeto más
// completo que se puede armar, para mostrar cada campo a medida que llega.
//
// Client-safe y sin dependencias. No reemplaza a `extraerJSON()` del
// servidor: el resultado DEFINITIVO siempre es el que valida el servidor al
// terminar; esto es sólo para la vista previa mientras se escribe.

/** Recortes máximos por llamada. Un texto roto a mitad (no sólo cortado al
 *  final) no se arregla recortando unos pocos caracteres; sin este tope, cada
 *  fragmento nuevo costaría O(n²). */
const MAX_RECORTES = 64;

/**
 * El valor más completo que se puede leer de `texto`, o `undefined` si todavía
 * no hay nada legible (ni siquiera la `{` de apertura). Tolera texto antes del
 * JSON (p. ej. un fence ```json) y después de que se cierra.
 *
 * Estrategia: cerrar lo que quedó abierto (string, arrays, objetos) y probar
 * `JSON.parse`; si falla —el corte cayó en una clave, un `:`, un número o un
 * literal a medias— sacar un carácter del final y volver a probar.
 */
export function parsearJSONParcial(texto: string): unknown {
  const inicio = texto.search(/[{[]/);
  if (inicio === -1) return undefined;

  let candidato = texto.slice(inicio);
  for (let i = 0; i < MAX_RECORTES && candidato.length > 0; i++) {
    try {
      return JSON.parse(cerrar(candidato));
    } catch {
      candidato = candidato.slice(0, -1);
    }
  }
  return undefined;
}

/** `t` (que empieza en `{` o `[`) con lo abierto cerrado. Si el JSON ya se
 *  cerró, lo devuelve hasta ahí y descarta lo que venga después. */
function cerrar(t: string): string {
  const abiertos: string[] = [];
  let enString = false;
  let escapando = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enString) {
      if (escapando) escapando = false;
      else if (c === "\\") escapando = true;
      else if (c === '"') enString = false;
      continue;
    }
    if (c === '"') enString = true;
    else if (c === "{") abiertos.push("}");
    else if (c === "[") abiertos.push("]");
    else if (c === "}" || c === "]") {
      abiertos.pop();
      if (abiertos.length === 0) return t.slice(0, i + 1);
    }
  }

  let cerrado = t;
  if (enString) {
    // Una `\` suelta al final escaparía la comilla de cierre.
    if (escapando) cerrado = cerrado.slice(0, -1);
    cerrado += '"';
  } else {
    // `{"a": "x",` → sin la coma final. Un `:` colgando no se saca acá: deja
    // una clave sin valor, que falla y se recorta en la vuelta siguiente.
    cerrado = cerrado.replace(/[\s,]+$/, "");
  }
  return cerrado + abiertos.reverse().join("");
}
