import styles from "./admin.module.css";

// VGRP-54 punto 4 — piso de carga para `/admin/*`. Hoy no hay ningún
// `loading.tsx` en el repo: `app/admin/layout.tsx` hace `await
// requireAdminPage()` y recién después cada página corre su query antes de
// emitir un byte, así que toda navegación deja la pantalla en blanco. El
// header del layout (topbar + nav) sigue pintando de inmediato — esto sólo
// reemplaza el slot de `children` mientras la página resuelve.
export default function Loading() {
  return (
    <div className={styles.page}>
      <p className={styles.vacio}>Cargando…</p>
    </div>
  );
}
