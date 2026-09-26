import type { ReactNode } from "react";
import { Button, TextLink } from "@/components/ui";
import { cerrarSesion } from "@/lib/auth/actions";
import { requireAdminPage } from "@/lib/auth/admin";
import { AdminNav } from "./AdminNav";
import styles from "./admin.module.css";

// =============================================================================
// VGRP-35 — Shell del área de admin.
//
// `app/admin/` es una CARPETA LITERAL (no route group), hermana de `(app)`,
// `(auth)`, `(legal)`: `/admin` tiene que ser un prefijo real de URL para que
// `middleware.ts` lo matchee. NO hereda `app/(app)/layout.tsx` — sólo hereda
// `app/layout.tsx` (`<html>`/`<body>`).
//
// Este layout es DINÁMICO a propósito — es la excepción explícita a la regla
// "el layout no lee cookies" de `app/(app)/layout.tsx`: acá el gating por rol
// es parte del contrato de la pantalla. `requireAdminPage()` lee el claim ya
// verificado (cero queries) y hace `notFound()` / `redirect()` si no es admin,
// así ningún Server Component hijo del área llega a renderizar para un
// no-admin ("nunca pantalla parcial"). Es la 2ª de las 3 capas (middleware ->
// layout -> `requireAdmin()` en cada handler).
// =============================================================================

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();

  return (
    <div className={styles.shell}>
      <div className={styles.topbarWrap}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <TextLink href="/admin" className={styles.brandLink}>
              Panel · OG Circle
            </TextLink>
            <span className={styles.modoAdmin}>modo admin</span>
          </div>

          <AdminNav />

          <form action={cerrarSesion} className={styles.logoutForm}>
            <Button type="submit" variant="ghost" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </header>
      </div>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
