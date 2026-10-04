import { Button, TextFieldBase } from "@/components/ui";
import { ORDENES_USUARIOS, type OrdenUsuarios } from "@/lib/data/admin/usuarios";
import { Constants, type NivelAcceso } from "@/lib/database.types";
import styles from "../admin.module.css";

// VGRP-36 — filtros del listado de usuarios. Form nativo `method="get"`: al
// enviar navega a `/admin/usuarios?q=...&nivel=...&rol=...&orden=...` y el
// Server Component vuelve a consultar. No necesita JS de cliente — "cargar
// más" es un link con el cursor (ver page.tsx).
//
// VGRP-59/60 (Bloque 13 — plan único): el enum sólo trae dos valores ahora
// (ninguno/completo) — "ninguno"/"completo" son identificadores internos, no
// copy para el admin, así que se muestran como "Sin acceso"/"Con acceso" en
// vez de capitalizar el valor crudo del enum.

const NIVELES = Constants.public.Enums.nivel_acceso;
const ROLES = Constants.public.Enums.rol_usuario;
type RolUsuario = (typeof ROLES)[number];

const ETIQUETAS_NIVEL: Record<NivelAcceso, string> = {
  ninguno: "Sin acceso",
  completo: "Con acceso",
};

const ETIQUETAS_ROL: Record<RolUsuario, string> = {
  user: "Usuario",
  admin: "Admin",
};

const ETIQUETAS_ORDEN: Record<OrdenUsuarios, string> = {
  recientes: "Más nuevos primero",
  antiguos: "Más viejos primero",
  alfabetico: "Alfabético (email)",
};

export function UsuariosFiltros({
  q,
  nivel,
  rol,
  terminos,
  desde,
  hasta,
  orden,
}: {
  q?: string;
  nivel?: string;
  rol?: string;
  terminos?: string;
  desde?: string;
  hasta?: string;
  orden?: string;
}) {
  return (
    <form method="get" className={styles.filtros}>
      <TextFieldBase
        id="q"
        name="q"
        label="Email, nombre o teléfono"
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
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Rol</span>
        <select name="rol" defaultValue={rol ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETAS_ROL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Términos</span>
        <select name="terminos" defaultValue={terminos ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          <option value="si">Aceptados</option>
          <option value="no">Sin aceptar</option>
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Alta desde</span>
        <input type="date" name="desde" defaultValue={desde ?? ""} className={styles.filtroInput} />
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Alta hasta</span>
        <input type="date" name="hasta" defaultValue={hasta ?? ""} className={styles.filtroInput} />
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Orden</span>
        <select name="orden" defaultValue={orden ?? "recientes"} className={styles.selectNativo}>
          {ORDENES_USUARIOS.map((o) => (
            <option key={o} value={o}>
              {ETIQUETAS_ORDEN[o]}
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
