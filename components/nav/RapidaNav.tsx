"use client";

// Accesos rápidos del header (sólo desktop, ≥900px — en mobile el menú es el
// único punto de navegación). Hoja de Client Component: necesita la ruta
// actual para marcar el activo y medir dónde dibujar el indicador.
//
// Microinteracción: el indicador (una píldora de vidrio) se desliza hasta el
// link activo, o hasta el que está bajo el puntero. Sólo escribe tres
// variables CSS (--ind-x, --ind-w, --ind-o); la animación la hace el
// compositor con transform/width (ver nav.module.css, .rapidaIndicador).

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { DESTINOS_NAV } from "./destinos";
import styles from "./nav.module.css";

// Los destinos navegables (no "próximamente"). Los mismos datos que el menú.
const DESTINOS_RAPIDOS = DESTINOS_NAV.filter((destino) => !destino.proximamente);

export function RapidaNav() {
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

  // Al montar y en cada cambio de ruta: el indicador va al activo. Layout
  // effect para que no se vea un frame con el indicador en la posición vieja.
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
      className={styles.rapida}
      aria-label="Accesos rápidos"
      onMouseLeave={volverAlActivo}
    >
      <span className={styles.rapidaIndicador} aria-hidden="true" />
      {DESTINOS_RAPIDOS.map((destino) => {
        const externo = !destino.href.startsWith("/");
        const actual =
          !externo && (pathname === destino.href || pathname.startsWith(`${destino.href}/`));
        return (
          <NextLink
            key={destino.href}
            href={destino.href}
            className={externo ? `${styles.rapidaLink} ${styles.rapidaExterno}` : styles.rapidaLink}
            aria-current={actual ? "page" : undefined}
            {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onMouseEnter={(e) => moverIndicadorA(e.currentTarget)}
            onFocus={(e) => moverIndicadorA(e.currentTarget)}
            onBlur={volverAlActivo}
          >
            {destino.label}
            {externo ? <Icon name="externo" size={14} /> : null}
          </NextLink>
        );
      })}
    </nav>
  );
}
