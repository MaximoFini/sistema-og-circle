import { Button, TextFieldBase } from "@/components/ui";
import { Constants, type NivelAcceso } from "@/lib/database.types";
import styles from "../admin.module.css";

// VGRP-36 — filtros del listado de usuarios. Form nativo `method="get"`: al
// enviar navega a `/admin/usuarios?q=...&nivel=...` y el Server Component vuelve
// a consultar. No necesita JS de cliente — "cargar más" es un link con el
// cursor (ver page.tsx).
//
// VGRP-59/60 (Bloque 13 — plan único): el enum sólo trae dos valores ahora
// (ninguno/completo) — "ninguno"/"completo" son identificadores internos, no
// copy para el admin, así que se muestran como "Sin acceso"/"Con acceso" en
// vez de capitalizar el valor crudo del enum.

const NIVELES = Constants.public.Enums.nivel_acceso;

const ETIQUETAS_NIVEL: Record<NivelAcceso, string> = {
  ninguno: "Sin acceso",
  completo: "Con acceso",
};

export function UsuariosFiltros({ q, nivel }: { q?: string; nivel?: string }) {
  return (
    <form method="get" className={styles.filtros}>
      <TextFieldBase
        id="q"
        name="q"
        label="Email"
        placeholder="Buscar"
        defaultValue={q ?? ""}
        autoComplete="off"
      />
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Nivel</span>
        <select name="nivel" defaultValue={nivel ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {ETIQUETAS_NIVEL[n]}
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
