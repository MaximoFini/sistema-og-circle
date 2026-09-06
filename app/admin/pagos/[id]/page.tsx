import { notFound } from "next/navigation";
import { TextLink } from "@/components/ui";
import { obtenerPago } from "@/lib/data/admin/pagos";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../admin.module.css";
import { ReprocesarButton } from "./ReprocesarButton";

// VGRP-37 — Detalle de un pago. Server Component: la fila de `pagos`, el
// `payload_raw` FILTRADO (`sanitizarPayloadRaw`) en un `<pre>` con la nota de
// que es una vista de diagnóstico, y `ReprocesarButton` (Client Component) SÓLO
// si el pago está `approved`. `:id` sin match -> `notFound()` (US-5: 404).

export const dynamic = "force-dynamic";

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PagoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceRoleClient();
  const detalle = await obtenerPago(admin, id);
  if (!detalle) notFound();

  const { pago, payloadRawSanitizado, sinAplicar, userEmail } = detalle;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Pago de {userEmail}</h1>
      <p className={styles.badgeFila}>
        <span className={styles.badgeEstado}>{pago.estado}</span>
        {sinAplicar ? <span className={styles.badgeSinAplicar}>sin aplicar</span> : null}
      </p>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Datos</h2>
        <dl className={styles.dl}>
          <dt>ID del pago</dt>
          <dd>{pago.id}</dd>
          <dt>Usuario</dt>
          <dd>
            <TextLink href={`/admin/usuarios/${pago.user_id}`}>{userEmail}</TextLink>
          </dd>
          <dt>Proveedor</dt>
          <dd>{pago.proveedor}</dd>
          <dt>Referencia</dt>
          <dd>{pago.proveedor_ref}</dd>
          <dt>Nivel comprado</dt>
          <dd>{pago.nivel_comprado}</dd>
          <dt>Monto (ARS)</dt>
          <dd>{pago.monto_ars.toLocaleString("es-AR")}</dd>
          <dt>Fecha</dt>
          <dd>{fecha(pago.created_at)}</dd>
        </dl>
      </div>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>payload_raw (filtrado)</h2>
        <p className={styles.notaFiltrada}>
          Vista filtrada para diagnóstico — no es el evento completo. Los datos sensibles (tarjeta,
          tokens, credenciales) no se muestran.
        </p>
        <pre className={styles.pre}>{JSON.stringify(payloadRawSanitizado, null, 2)}</pre>
      </div>

      {pago.estado === "approved" ? (
        <div className={styles.seccion}>
          <h2 className={styles.seccionTitulo}>Reproceso</h2>
          <p className={styles.lede}>
            Vuelve a proyectar el nivel del usuario a partir de todo su ledger. Es idempotente: si
            el pago ya está aplicado, no cambia nada.
          </p>
          <ReprocesarButton pagoId={pago.id} />
        </div>
      ) : null}
    </div>
  );
}
