import { getPrecios } from "@/lib/config";
import type { NivelComprable } from "@/lib/mercadopago/preferencia";
import { ComprarButton } from "./ComprarButton";
import styles from "./comprar.module.css";

// =============================================================================
// VGRP-22 — Selección de nivel + inicio de checkout.
//
// Server Component: sólo lee `getPrecios()` (Edge Config) para mostrar el
// precio de cada nivel. El armado de la preferencia y la llamada real a la
// API de Mercado Pago viven en el Server Action (`_actions.ts`), invocado
// desde el Client Component `ComprarButton` — este archivo no habla con MP.
//
// Fail-closed (CLAUDE.md): si `getPrecios()` devuelve `ok: false`, la página
// NUNCA muestra un precio inventado ni deja intentar el checkout — se
// deshabilita explícitamente con un estado de error ("Checkout no
// disponible"). No hay recuperación automática acá: es la misma regla fail-
// closed de `lib/config/index.ts`, aplicada a la UI.
// =============================================================================

const NIVELES_COMPRABLES: readonly NivelComprable[] = ["principiante", "avanzado"];

const formatearPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default async function ComprarPage() {
  const precios = await getPrecios();

  if (!precios.ok) {
    return (
      <div className={styles.wrap}>
        <div className={styles.errorCard}>
          <h1 className={styles.errorTitle}>Checkout no disponible</h1>
          <p className={styles.copy}>
            No pudimos cargar los precios en este momento. Probá de nuevo en unos minutos — si el
            problema sigue, escribinos por WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Elegí tu nivel</p>
        <h1 className={styles.title}>Comprar acceso</h1>
      </div>

      {NIVELES_COMPRABLES.map((nivel) => (
        <div key={nivel} className={styles.card}>
          <p className={styles.nivelNombre}>{nivel}</p>
          <p className={styles.precio}>
            {formatearPrecio.format(precios.precios[nivel])}
            <span>pago único</span>
          </p>
          <p className={styles.copy}>
            Acceso {nivel} a la plataforma. Se activa apenas Mercado Pago confirma el pago.
          </p>
          <ComprarButton nivel={nivel} />
        </div>
      ))}
    </div>
  );
}
