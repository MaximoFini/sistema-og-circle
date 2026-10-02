import { Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { getNivel, nivelAlcanzaOSupera } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import { getPlan, getPrecios } from "@/lib/config";
import { formatearPrecio } from "@/lib/format";
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
//
// VGRP-59/60 (Bloque 13 — plan único): antes esta página iteraba dos niveles
// comprables (Principiante/Avanzado) mostrando dos cards, una de ellas
// "destacada" como la opción completa. Con un solo plan ya no hay nada que
// elegir ni destacar — una sola card, con el nombre comercial del plan
// (`getPlan()`, Edge Config) y el precio único (`precios.plan`).
// =============================================================================
export const dynamic = "force-dynamic";

export default async function ComprarPage() {
  // Auditoría de Mercado Pago (decisión del equipo): un usuario que ya tiene
  // el plan no debe ver habilitado el botón de comprarlo de nuevo —
  // `crearCheckout` (_actions.ts) ya lo bloquea del lado del servidor, esto
  // es sólo para que la UI no ofrezca algo que va a fallar.
  //
  // Las tres lecturas (JWT, precios y nombre del plan en Edge Config) son
  // independientes — en paralelo en vez de en serie, ya que esta página es
  // `force-dynamic` y ninguna depende del resultado de otra.
  const [claims, precios, plan] = await Promise.all([getVerifiedClaims(), getPrecios(), getPlan()]);
  const yaTienePlan = nivelAlcanzaOSupera(getNivel(claims), "completo");

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
        <p className={styles.eyebrow}>Comprá tu acceso</p>
        <h1 className={styles.title}>Comprar acceso</h1>
      </div>

      <div className={styles.card}>
        <p className={styles.nivelNombre}>{plan.nombre}</p>
        <p className={styles.precio}>
          {formatearPrecio.format(precios.precios.plan)}
          <span>pago único</span>
        </p>
        <p className={styles.copy}>
          {yaTienePlan
            ? "Ya tenés acceso completo a la plataforma."
            : "Acceso completo a la plataforma. Se activa apenas Mercado Pago confirma el pago."}
        </p>
        {yaTienePlan ? (
          <Button variant="ghost" fullWidth disabled>
            Ya tenés este plan
          </Button>
        ) : (
          <ComprarButton nivel="completo" />
        )}
      </div>
    </div>
  );
}
