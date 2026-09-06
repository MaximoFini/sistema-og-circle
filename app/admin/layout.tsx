import type { ReactNode } from "react";
import { Button, TextLink } from "@/components/ui";
import { requireAdminPage } from "@/lib/auth/admin";
import { cerrarSesion } from "./_actions";
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

const NAV = [
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/auditoria", label: "Auditoría" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <TextLink href="/admin" className={styles.brandLink}>
            Panel · OG Circle
          </TextLink>
          <span className={styles.modoAdmin}>modo admin</span>
        </div>

        <nav className={styles.nav} aria-label="Secciones del panel">
          {NAV.map(({ href, label }) => (
            <TextLink key={href} href={href} className={styles.navLink}>
              {label}
            </TextLink>
          ))}
        </nav>

        <form action={cerrarSesion} className={styles.logoutForm}>
          <Button type="submit" variant="ghost">
            Cerrar sesión
          </Button>
        </form>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
