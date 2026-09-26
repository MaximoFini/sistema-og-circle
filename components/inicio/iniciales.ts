// Iniciales para el avatar de las tarjetas de directorio ("Agente Canario" →
// "AC"). Hasta dos letras; ignora palabras vacías y símbolos sueltos.
export function iniciales(nombre: string): string {
  const letras = nombre
    .split(/\s+/)
    .map((palabra) => palabra.match(/\p{L}|\p{N}/u)?.[0] ?? "")
    .filter(Boolean);
  if (letras.length === 0) return "·";
  const [primera, ...resto] = letras;
  return (primera + (resto.at(-1) ?? "")).toUpperCase();
}
