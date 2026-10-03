import { Suspense } from "react";
import { TextLink } from "@/components/ui";
import { listarCuentas } from "@/lib/data/admin/cuentas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../admin.module.css";

// VGRP-62 — cuentas de cobro: a dónde transfieren los usuarios. Server
// Component con lectura por service role (la barrera de autorización es el
// layout gateado de /admin), mismo criterio que /admin/contenido.

export const dynamic = "force-dynamic";

async function ListaCuentas() {
  const admin = createServiceRoleClient();
  const cuentas = await listarCuentas(admin);

  let estado = "La cuenta activa es la que ven los usuarios al pagar por transferencia.";
  if (cuentas.length === 0) estado = "Todavía no hay cuentas cargadas.";
  else if (!cuentas.some((c) => c.activa))
    estado = "Ninguna cuenta está activa: los usuarios no pueden pagar hasta que marques una.";

  return (
    <>
      <p className={styles.lede}>{estado}</p>

      <div className={styles.formAcciones}>
        <TextLink href="/admin/cuentas/nuevo" className={styles.card}>
          + Nueva cuenta
        </TextLink>
      </div>

      {cuentas.length === 0 ? null : (
        <ul className={styles.itemLista}>
          {cuentas.map((cuenta) => (
            <li key={cuenta.id}>
              <TextLink
                href={`/admin/cuentas/${cuenta.id}`}
                className={`${styles.itemFila} ${cuenta.activa ? "" : styles.itemInactivo}`}
              >
                <span className={styles.itemInfo}>
                  <span className={styles.itemTitulo}>{cuenta.titular}</span>
                  <span className={styles.itemSub}>
                    {cuenta.banco} · alias {cuenta.alias}
                  </span>
                </span>
                {cuenta.activa ? <span className={styles.badgeEstado}>Activa</span> : null}
              </TextLink>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function CuentasPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Cuentas de cobro</h1>

      <Suspense fallback={<p className={styles.vacio}>Cargando cuentas…</p>}>
        <ListaCuentas />
      </Suspense>
    </div>
  );
}
