import { TextLink } from "@/components/ui";
import styles from "../admin.module.css";

// VGRP-38 — índice del CRUD de contenido: un link por entidad. Server
// Component estático (no lee nada de la base) — el layout de app/admin/ ya
// resolvió el guard de rol.

const ENTIDADES_UI = [
  {
    slug: "agentes",
    titulo: "Agentes de compra",
    desc: "Directorio de agentes en China. Contacto sensible.",
  },
  { slug: "videos", titulo: "Videos", desc: "Stage 1 y 2. provider_ref sensible." },
  {
    slug: "profesionales",
    titulo: "Profesionales",
    desc: "Contador, marketing, automatizaciones, UGC.",
  },
  {
    slug: "servicios_financieros",
    titulo: "Servicios financieros",
    desc: "Pagos al exterior, gestión financiera.",
  },
] as const;

export default function ContenidoIndexPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Contenido</h1>
      <p className={styles.lede}>
        Agentes, videos, profesionales y servicios financieros — CRUD con revalidación automática de
        las grillas públicas.
      </p>

      <div className={styles.cards}>
        {ENTIDADES_UI.map((e) => (
          <TextLink key={e.slug} href={`/admin/contenido/${e.slug}`} className={styles.card}>
            <span className={styles.cardTitle}>{e.titulo}</span>
            <span className={styles.cardDesc}>{e.desc}</span>
          </TextLink>
        ))}
      </div>
    </div>
  );
}
