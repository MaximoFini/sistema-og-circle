import type { Metadata } from "next";
import Link from "next/link";
import legalStyles from "../legal.module.css";
import styles from "./legales.module.css";

export const metadata: Metadata = { title: "Legales — OG Circle" };

const DOCUMENTOS = [
  { href: "/terminos", label: "Términos y Condiciones" },
  { href: "/privacidad", label: "Política de Privacidad" },
  { href: "/reembolsos", label: "Política de Reembolsos" },
] as const;

// VGRP-34 — índice de las tres páginas legales.
//
// Es el destino público único al que cualquier ticket futuro puede linkear
// sin tener que conocer las tres rutas de memoria: el checkout de Mercado
// Pago (VGRP-22, todavía no existe) y el footer de la landing pública (vive
// en otro repo/deploy — ver el comentario de `app/page.tsx`) apuntan acá.
//
// `legalStyles.title` reusa el mismo encabezado que `LegalDocPage.tsx` usa
// en las otras tres páginas — no se redeclara acá.
export default function LegalesPage() {
  return (
    <>
      <div>
        <h1 className={legalStyles.title}>Legales</h1>
        <p className={styles.subtitle}>
          Términos, privacidad y reembolsos de OG Circle. El registro exige aceptar los dos
          primeros.
        </p>
      </div>

      <div className={styles.list}>
        {DOCUMENTOS.map(({ href, label }) => (
          <Link key={href} href={href} className={styles.item}>
            <span className={styles.itemLabel}>{label}</span>
            <span className={styles.itemArrow} aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
