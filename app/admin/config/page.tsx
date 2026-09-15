import { getConfig } from "@/lib/config";
import styles from "../admin.module.css";
import { FlagsForm } from "./FlagsForm";
import { PreciosForm } from "./PreciosForm";

// VGRP-40 — Cierra el panel: Jota puede cambiar precios y flags de fase sin
// pedirle nada al programador. `requireAdminPage()` ya lo aplica el layout de
// `app/admin/` (mismo criterio que el resto de las páginas del panel, no se
// repite acá). Server Component: lee `getConfig()` directo, sin pasar por su
// propio `GET` (mismo patrón que el resto de `app/admin/*`).

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const { precios, flags } = await getConfig();

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Configuración</h1>
      <p className={styles.lede}>
        Precios por nivel y flags de fase. Los cambios se reflejan en el resto del sistema sin
        deploy — no hay control de descuentos ni de porcentaje promocional acá, no hay descuentos en
        esta fase.
      </p>

      <section className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Precios</h2>
        {precios.ok ? (
          <PreciosForm preciosIniciales={precios.precios} />
        ) : (
          <p className={styles.avisoFiltro}>
            No se pudieron leer los precios actuales de Edge Config ({precios.error}). No se muestra
            un formulario editable para evitar guardar un valor a ciegas — reintentá recargando la
            página.
          </p>
        )}
      </section>

      <section className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Flags de fase</h2>
        <FlagsForm flagsIniciales={flags} />
      </section>
    </div>
  );
}
