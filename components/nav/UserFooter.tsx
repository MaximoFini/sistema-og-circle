// VGRP-27 — identidad del usuario en el menú (arriba, como la tarjeta de
// cuenta de Ajustes en iOS). Presentacional puro: recibe los datos ya
// resueltos por MenuToggle, que hace el único fetch a /api/perfil. El
// "Cerrar sesión" vive al final del menú (NavDrawer.tsx), no acá.

import styles from "./nav.module.css";

export interface PerfilResumen {
  nombre: string | null;
  email: string;
}

export interface UserFooterProps {
  perfil: PerfilResumen | null;
  cargando: boolean;
}

export function UserFooter({ perfil, cargando }: UserFooterProps) {
  const nombreMostrado = perfil?.nombre?.trim() || perfil?.email;
  const inicial = (nombreMostrado ?? "?").charAt(0).toUpperCase();

  return (
    <div className={styles.cuenta}>
      <span className={styles.avatar} aria-hidden="true">
        {cargando ? "" : inicial}
      </span>
      <div className={styles.cuentaTexto}>
        {cargando ? (
          <>
            <span className={styles.skeleton} />
            <span className={styles.skeleton} style={{ width: 100 }} />
          </>
        ) : (
          <>
            <span className={styles.cuentaNombre}>{nombreMostrado ?? "Tu cuenta"}</span>
            {perfil?.nombre ? <span className={styles.cuentaEmail}>{perfil.email}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
