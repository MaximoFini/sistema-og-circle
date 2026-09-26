"use client";

// Secciones del panel, como control segmentado: el indicador (píldora de
// vidrio) se desliza a la sección activa o a la que está bajo el puntero.
// Mismo mecanismo que components/nav/RapidaNav.tsx — sólo escribe variables
// CSS; la animación la hace el compositor. Hoja de Client Component: el
// layout del admin sigue siendo Server Component (requireAdminPage()).

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import styles from "./admin.module.css";

const SECCIONES = [
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/contenido", label: "Contenido" },
  { href: "/admin/config", label: "Config" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  const moverIndicadorA = useCallback((el: HTMLElement | null) => {
    const nav = navRef.current;
    if (!nav) return;
    if (!el) {
      nav.style.setProperty("--ind-o", "0");
      return;
    }
    nav.style.setProperty("--ind-x", `${el.offsetLeft}px`);
    nav.style.setProperty("--ind-w", `${el.offsetWidth}px`);
    nav.style.setProperty("--ind-o", "1");
  }, []);

  const volverAlActivo = useCallback(() => {
    moverIndicadorA(navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [moverIndicadorA]);

  useLayoutEffect(() => {
    volverAlActivo();
  }, [pathname, volverAlActivo]);

  // Re-medir cuando cambian los anchos: la fuente web termina de cargar
  // (display: swap) o la ventana cambia de tamaño.
  useEffect(() => {
    let vigente = true;
    document.fonts?.ready.then(() => {
      if (vigente) volverAlActivo();
    });
    window.addEventListener("resize", volverAlActivo);
    return () => {
      vigente = false;
      window.removeEventListener("resize", volverAlActivo);
    };
  }, [volverAlActivo]);

  return (
    <nav
      ref={navRef}
      className={styles.nav}
      aria-label="Secciones del panel"
      onMouseLeave={volverAlActivo}
    >
      <span className={styles.navIndicador} aria-hidden="true" />
      {SECCIONES.map(({ href, label }) => {
        const actual = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <NextLink
            key={href}
            href={href}
            className={styles.navLink}
            aria-current={actual ? "page" : undefined}
            onMouseEnter={(e) => moverIndicadorA(e.currentTarget)}
            onFocus={(e) => moverIndicadorA(e.currentTarget)}
            onBlur={volverAlActivo}
          >
            {label}
          </NextLink>
        );
      })}
    </nav>
  );
}
