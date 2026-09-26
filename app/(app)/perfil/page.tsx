import NextLink from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cerrarSesion } from "@/lib/auth/actions";
import type { NivelAcceso } from "@/lib/auth/claims";
import { createSupabaseServerClient, getVerifiedClaims } from "@/lib/auth/server";
import { getLinks } from "@/lib/config";
import { PerfilForm } from "./PerfilForm";
import styles from "./perfil.module.css";

// =============================================================================
// VGRP-33 — Perfil del usuario. A diferencia de `/dashboard/[variante]`, esta
// ruta NO tiene `generateStaticParams` — es una página normal, así que puede
// ser un Server Component dinámico sin más (mismo criterio que `/admin/*` o
// `/comprar`): lee `getVerifiedClaims()`/`profiles` directo, sin la gimnasia
// de Client Component + fetch-post-hidratación que sí hace falta dentro del
// shell estático del dashboard.
//
// El nivel mostrado sale de `profiles.nivel` (la misma fuente de verdad que
// proyecta el claim del JWT — VGRP-24), nunca de un prop heredado ni de la URL.
// =============================================================================

const ACCESOS_PRINCIPIANTE = [
  "Formación completa (11 videos)",
  "Calculadora de costos",
  "Directorio de profesionales",
  "Servicios financieros",
];

const ACCESOS_AVANZADO_ADICIONALES = [
  "Depósitos en Miami, China y España",
  "Agente de muestras y de volumen",
  "Flete y despacho gestionado",
  "Tracking marítimo",
  "Datos SWIFT",
];

export default async function PerfilPage() {
  const claims = await getVerifiedClaims();
  if (!claims) {
    // El middleware ya exige sesión para llegar acá — esto es defensa en
    // profundidad, no el candado real (mismo criterio que el resto del repo).
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: perfil, error }, links] = await Promise.all([
    supabase.from("profiles").select("nombre, email, telefono, nivel").single(),
    getLinks(),
  ]);

  if (error || !perfil) {
    notFound();
  }

  const nivel = perfil.nivel as NivelAcceso;

  const nombreMostrado = perfil.nombre?.trim() || perfil.email;

  return (
    <div className={styles.page}>
      <header className={styles.encabezado}>
        <span className={styles.avatar} aria-hidden="true">
          {nombreMostrado.charAt(0).toUpperCase()}
        </span>
        <div className={styles.encabezadoTexto}>
          <p className={styles.eyebrow}>Tu cuenta</p>
          <h1 className={styles.titulo}>Perfil</h1>
          <p className={styles.nivelActivo}>
            Nivel activo: <strong>{nivel}</strong>
          </p>
        </div>
      </header>

      <section className={styles.cardDatos} aria-label="Editar datos">
        <div className={styles.cardCabecera}>
          <h2 className={styles.h2}>Tus datos</h2>
          <p className={styles.email}>{perfil.email}</p>
        </div>
        <PerfilForm nombreInicial={perfil.nombre ?? ""} telefonoInicial={perfil.telefono ?? ""} />
      </section>

      <div className={styles.columna}>
        <section className={styles.grupo} aria-label="Accesos habilitados">
          <h2 className={styles.grupoTitulo}>Accesos</h2>
          {nivel === "ninguno" ? (
            <div className={styles.grupoCuerpo}>
              <p className={styles.descripcion}>
                Todavía no tenés ningún nivel activo — comprá tu acceso para desbloquear la
                plataforma.
              </p>
              <NextLink href="/comprar" className={styles.ctaComprar}>
                Comprar acceso
              </NextLink>
            </div>
          ) : (
            <>
              <ul className={styles.lista}>
                {ACCESOS_PRINCIPIANTE.map((item) => (
                  <li key={item} className={styles.acceso}>
                    <Icon name="check" size={18} className={styles.check} />
                    {item}
                  </li>
                ))}
                {nivel === "avanzado"
                  ? ACCESOS_AVANZADO_ADICIONALES.map((item) => (
                      <li key={item} className={styles.acceso}>
                        <Icon name="check" size={18} className={styles.check} />
                        {item}
                      </li>
                    ))
                  : null}
              </ul>

              {nivel === "principiante" ? (
                <div className={styles.grupoCuerpo}>
                  <p className={styles.descripcion}>Avanzado suma, además:</p>
                  <ul className={styles.lista}>
                    {ACCESOS_AVANZADO_ADICIONALES.map((item) => (
                      <li key={item} className={`${styles.acceso} ${styles.accesoPendiente}`}>
                        <Icon name="candado" size={16} className={styles.check} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <NextLink href="/comprar" className={styles.ctaComprar}>
                    Mejorar mi nivel
                  </NextLink>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className={styles.grupo} aria-label="Accesos rápidos">
          <h2 className={styles.grupoTitulo}>Accesos rápidos</h2>
          <ul className={styles.lista}>
            <li className={styles.fila}>
              <span className={styles.iconTile}>
                <Icon name="tracking" size={18} />
              </span>
              <span className={styles.filaLabel}>Mis envíos</span>
              <span className={styles.badge}>Próximamente</span>
            </li>
            <li className={styles.fila}>
              <span className={styles.iconTile}>
                <Icon name="documento" size={18} />
              </span>
              <span className={styles.filaLabel}>Documentos</span>
              <span className={styles.badge}>Próximamente</span>
            </li>
          </ul>
        </section>

        <section className={styles.grupo} aria-label="Soporte">
          <h2 className={styles.grupoTitulo}>Soporte</h2>
          <div className={styles.lista}>
            <a
              href={links.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.fila} ${styles.filaLink}`}
            >
              <span className={styles.iconTile}>
                <Icon name="mensaje" size={18} />
              </span>
              <span className={styles.filaLabel}>Escribinos por WhatsApp</span>
              <Icon name="externo" size={16} className={styles.chevron} />
            </a>
          </div>
          <p className={styles.grupoPie}>¿Tenés una duda o un problema? Escribinos.</p>
        </section>

        <form action={cerrarSesion}>
          <button type="submit" className={styles.salir}>
            <Icon name="salir" size={18} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
