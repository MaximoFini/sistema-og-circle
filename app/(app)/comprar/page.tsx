import { Icon } from "@/components/ui/Icon";
import { getPrecios } from "@/lib/config";
import { formatearPrecio } from "@/lib/format";
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
//
// VGRP-55 punto 3 — `force-dynamic` es necesario acá: esta página no usa
// ninguna API dinámica de Next (no lee cookies ni searchParams; ComprarButton
// es Client Component), así que sin esto Next la prerenderiza como estática
// en build time — congelando el PRECIO de ESE momento para siempre, hasta el
// próximo deploy. El equipo ya encontró y arregló este mismo bug en
// app/(auth)/registro/page.tsx (mismo patrón exacto); acá se había repetido,
// y encima sobre el número que cobra: cambiar un precio en Edge Config no
// tenía ningún efecto hasta el próximo deploy.
// =============================================================================
export const dynamic = "force-dynamic";

const NIVELES_COMPRABLES: readonly NivelComprable[] = ["principiante", "avanzado"];

export default async function ComprarPage() {
  const precios = await getPrecios();

  if (!precios.ok) {
    return (
      <div className={styles.wrap}>
        <div className={styles.errorCard}>
          <span className={styles.errorIcono}>
            <Icon name="candado" size={24} />
          </span>
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
        // Avanzado es el nivel completo: se destaca sólo con el reflejo ámbar del borde.
        <div
          key={nivel}
          className={nivel === "avanzado" ? `${styles.card} ${styles.cardDestacada}` : styles.card}
        >
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
