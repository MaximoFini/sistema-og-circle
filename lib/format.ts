// Formatos compartidos de presentación. Sin "server-only": lo usan tanto
// Server Components (app/(app)/comprar/page.tsx) como Client Components
// (app/admin/config/PreciosForm.tsx) — hoisted acá para no reimplementarlo
// en cada pantalla que muestra un precio en ARS.

export const formatearPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function capitalizar(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
