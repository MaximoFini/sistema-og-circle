import { notFound } from "next/navigation";
import { Button, TextLink } from "@/components/ui";
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

  return (
    <div className={styles.page}>
      <header className={styles.encabezado}>
        <p className={styles.eyebrow}>Tu cuenta</p>
        <h1 className={styles.titulo}>Perfil</h1>
        <p className={styles.nivelActivo}>
          Nivel activo: <strong>{nivel}</strong>
        </p>
      </header>

      <section className={styles.card} aria-label="Editar datos">
        <h2 className={styles.h2}>Tus datos</h2>
        <p className={styles.email}>{perfil.email}</p>
        <PerfilForm nombreInicial={perfil.nombre ?? ""} telefonoInicial={perfil.telefono ?? ""} />
      </section>

      <section className={styles.card} aria-label="Accesos habilitados">
        <h2 className={styles.h2}>Accesos</h2>
        {nivel === "ninguno" ? (
          <>
            <p className={styles.descripcion}>
              Todavía no tenés ningún nivel activo — comprá tu acceso para desbloquear la
              plataforma.
            </p>
            <TextLink href="/comprar" className={styles.ctaComprar}>
              Comprar acceso
            </TextLink>
          </>
        ) : (
          <>
            <ul className={styles.listaAccesos}>
              {ACCESOS_PRINCIPIANTE.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {nivel === "avanzado"
                ? ACCESOS_AVANZADO_ADICIONALES.map((item) => <li key={item}>{item}</li>)
                : null}
            </ul>

            {nivel === "principiante" ? (
              <>
                <p className={styles.descripcion}>Avanzado suma, además:</p>
                <ul className={styles.listaAccesos}>
                  {ACCESOS_AVANZADO_ADICIONALES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <TextLink href="/comprar" className={styles.ctaComprar}>
                  Mejorar mi nivel
                </TextLink>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className={styles.card} aria-label="Accesos rápidos">
        <h2 className={styles.h2}>Accesos rápidos</h2>
        <ul className={styles.listaAccesos}>
          <li>
            Mis envíos <span className={styles.badge}>Próximamente</span>
          </li>
          <li>
            Documentos <span className={styles.badge}>Próximamente</span>
          </li>
        </ul>
      </section>

      <section className={styles.card} aria-label="Soporte">
        <h2 className={styles.h2}>Soporte</h2>
        <p className={styles.descripcion}>¿Tenés una duda o un problema? Escribinos.</p>
        <TextLink
          href={links.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.ctaComprar}
        >
          Escribinos por WhatsApp
        </TextLink>
      </section>

      <form action={cerrarSesion}>
        <Button type="submit" variant="ghost">
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
