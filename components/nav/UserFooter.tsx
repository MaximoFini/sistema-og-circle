// VGRP-27 — pie del drawer: identidad del usuario + cerrar sesión.
// Presentacional puro (recibe los datos ya resueltos por DashboardHeader,
// que es quien hace el único fetch a /api/perfil) — así este archivo no
// necesita saber nada de loading/fetch, sólo renderizar.

import { Button } from "@/components/ui";
import { cerrarSesion } from "@/lib/auth/actions";
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
    <div className={styles.userFooter}>
      <div className={styles.userInfo}>
        <span className={styles.avatar} aria-hidden="true">
          {cargando ? "" : inicial}
        </span>
        <div className={styles.userTexto}>
          {cargando ? (
            <span className={styles.userSkeleton} />
          ) : (
            <>
              <span className={styles.userNombre}>{nombreMostrado ?? "Tu cuenta"}</span>
              {perfil?.nombre ? <span className={styles.userEmail}>{perfil.email}</span> : null}
            </>
          )}
        </div>
      </div>

      <form action={cerrarSesion}>
        <Button type="submit" variant="ghost" fullWidth>
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
