import { TextLink } from "@/components/ui";
import styles from "./admin.module.css";

// VGRP-35 — Índice del panel. Tres cards a las secciones.
//
// El callout con `totalSinAplicar` (número ámbar destacado que linkea al
// ledger filtrado) se agrega en VGRP-37 (37-T11): depende de la vista
// `admin_pagos_ledger`, que no existe en este paquete. Hasta entonces el
// índice se entrega con los 3 cards y sin ese callout.

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

export default function AdminIndexPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Panel de administración</h1>
      <p className={styles.lede}>
        Herramienta interna para reparar a mano lo que el flujo automático de cobro no resolvió.
      </p>

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
