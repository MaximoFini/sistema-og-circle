import styles from "./loading.module.css";

// VGRP-54 punto 4 — piso de carga para las páginas dinámicas de `(app)` (p.
// ej. `/dashboard` sin nivel, `/perfil`, `/comprar`): sin esto, la navegación
// deja la pantalla en blanco mientras el Server Component resuelve sus datos.
// No aplica a `/dashboard/[variante]`, que es 100% estática y no tiene nada
// que esperar. `app/(app)/layout.tsx` (header + footer) sigue pintando de
// inmediato — Next sólo reemplaza el slot de `children` mientras la página se
// resuelve, nunca el shell entero.
export default function Loading() {
  return (
    <div className={styles.contenedor}>
      <p className={styles.texto}>Cargando…</p>
    </div>
  );
}
