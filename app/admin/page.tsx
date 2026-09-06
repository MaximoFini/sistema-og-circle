import { TextLink } from "@/components/ui";
import { contarPagosSinAplicar } from "@/lib/data/admin/pagos";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "./admin.module.css";

// VGRP-35 — Índice del panel. Tres cards a las secciones.
//
// VGRP-37 (37-T11) sumó el callout con `totalSinAplicar`: número ámbar
// destacado que linkea al ledger filtrado por los pagos aprobados que no
// quedaron aplicados. Es "el admin ve el caso a reparar sin buscarlo" a nivel
// índice (design.md §"Detección de pago aprobado sin nivel aplicado").

export const dynamic = "force-dynamic";

const SECCIONES = [
  {
    href: "/admin/usuarios",
    titulo: "Usuarios",
    desc: "Buscar por email, ver la ficha completa y activar o cambiar el nivel a mano.",
  },
  {
    href: "/admin/pagos",
    titulo: "Pagos",
    desc: "Ledger de pagos con los aprobados que no quedaron aplicados, y reproceso.",
  },
  {
    href: "/admin/auditoria",
    titulo: "Auditoría",
    desc: "Registro inmutable de toda acción de admin: quién, qué y con qué valores.",
  },
] as const;

export default async function AdminIndexPage() {
  const admin = createServiceRoleClient();
  const totalSinAplicar = await contarPagosSinAplicar(admin);

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Panel de administración</h1>
      <p className={styles.lede}>
        Herramienta interna para reparar a mano lo que el flujo automático de cobro no resolvió.
      </p>

      <TextLink
        href="/admin/pagos"
        className={`${styles.callout} ${totalSinAplicar > 0 ? styles.calloutAlerta : ""}`}
      >
        <span className={styles.calloutNumero}>{totalSinAplicar}</span>
        <span className={styles.calloutTexto}>
          {totalSinAplicar === 0
            ? "No hay pagos aprobados sin aplicar. Todo al día."
            : totalSinAplicar === 1
              ? "pago aprobado sin aplicar. Abrí el ledger para repararlo."
              : "pagos aprobados sin aplicar. Abrí el ledger para repararlos."}
        </span>
      </TextLink>

      <div className={styles.cards}>
        {SECCIONES.map(({ href, titulo, desc }) => (
          <TextLink key={href} href={href} className={styles.card}>
            <span className={styles.cardTitle}>{titulo}</span>
            <span className={styles.cardDesc}>{desc}</span>
          </TextLink>
        ))}
      </div>
    </div>
  );
}
