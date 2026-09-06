import { Button, TextField } from "@/components/ui";
import { Constants } from "@/lib/database.types";
import styles from "../admin.module.css";

// VGRP-36 — filtros del listado de usuarios. Form nativo `method="get"`: al
// enviar navega a `/admin/usuarios?q=...&nivel=...` y el Server Component vuelve
// a consultar. No necesita JS de cliente — "cargar más" es un link con el
// cursor (ver page.tsx).

const NIVELES = Constants.public.Enums.nivel_acceso;

export function UsuariosFiltros({ q, nivel }: { q?: string; nivel?: string }) {
  return (
    <form method="get" className={styles.filtros}>
      <TextField
        name="q"
        label="Email"
        placeholder="buscar por email"
        defaultValue={q ?? ""}
        autoComplete="off"
      />
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Nivel</span>
        <select name="nivel" defaultValue={nivel ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="ghost">
        Filtrar
      </Button>
    </form>
  );
}
