import type { Json } from "@/lib/database.types";
import { formatearPrecio } from "@/lib/format";
import { nivelLabel } from "../etiquetas";

// Traduce una fila de `admin_audit_log` a lenguaje natural para el admin.
// `accion`/`entidad` son texto libre en la tabla y cada mutación guarda su
// propia forma de `valor_anterior`/`valor_nuevo` (ver los `ResultadoMutacion`
// de lib/data/admin/*): acá se conoce cada forma. Una acción desconocida cae
// a una descripción genérica, nunca rompe la pantalla.

export interface FilaAudit {
  accion: string;
  entidad: string;
  entidadId: string | null;
  valorAnterior: Json | null;
  valorNuevo: Json | null;
}

/** Datos que la tabla de auditoría no tiene y la página resuelve aparte: a
 *  quién pertenece un perfil o un pago referenciado por `entidad_id`. */
export interface ContextoAudit {
  emails: Map<string, string>;
  pagos: Map<string, { email: string | null; monto: number }>;
}

export interface Descripcion {
  titulo: string;
  /** Líneas de detalle (qué cambió). Vacío si no hay nada que agregar. */
  detalle: string[];
}

type Obj = Record<string, Json | undefined>;

function obj(v: Json | null | undefined): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function texto(v: Json | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

// `crear_contenido` / `editar_cuenta_cobro` / … -> verbo + sobre qué. Las
// entidades de contenido son la lista blanca de lib/data/admin/contenido.ts.
const VERBOS: Record<string, string> = { crear: "Creó", editar: "Editó", borrar: "Borró" };

const OBJETOS: Record<string, string> = {
  videos: "el video",
  agentes: "el agente",
  profesionales: "el profesional",
  servicios_financieros: "el servicio financiero",
  materiales: "el material",
  cuentas_cobro: "la cuenta de cobro",
};

const CAMPOS: Record<string, string> = {
  titulo: "Título",
  nombre: "Nombre",
  descripcion: "Descripción",
  especialidad: "Especialidad",
  rubro: "Rubro",
  contacto: "Contacto",
  activo: "Activo",
  activa: "Activa",
  publicado: "Publicado",
  orden: "Orden",
  stage: "Etapa",
  provider_ref: "Video",
  // VGRP-88 — materiales. Reemplazar el archivo cambia el path, el formato y el tamaño.
  storage_path: "Archivo",
  extension: "Formato",
  tipo: "Tipo",
  tamano_bytes: "Tamaño (bytes)",
  alias: "Alias",
  banco: "Banco",
  cbu_cvu: "CBU/CVU",
  cuit: "CUIT",
  titular: "Titular",
  notas: "Notas",
  checkout_habilitado: "Checkout habilitado",
  registro_habilitado: "Registro habilitado",
  mercadopago_habilitado: "Mercado Pago habilitado",
  fase: "Fase",
};

// Columnas de sistema que cambian solas en cada update: no son "lo que cambió".
const IGNORADOS = new Set(["id", "created_at", "updated_at"]);
// Valores tipo código que se leen mejor sin comillas.
const SIN_COMILLAS = new Set(["fase"]);
const MAX_VALOR = 60;

/** Ajustes de `actualizar_config`, cuyas claves no se explican solas. */
interface OpcionesDiff {
  etiquetas?: Record<string, string>;
  moneda?: boolean;
}

const CONFIG: Record<string, { titulo: string } & OpcionesDiff> = {
  precios: { titulo: "Cambió el precio", etiquetas: { plan: "Precio del plan" }, moneda: true },
  plan: { titulo: "Cambió el nombre del plan", etiquetas: { nombre: "Nombre del plan" } },
  flags: { titulo: "Cambió la configuración de la plataforma" },
};

function formatearValor(campo: string, v: Json | undefined, moneda = false): string {
  if (v === null || v === undefined || v === "") return "vacío";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return moneda ? formatearPrecio.format(v) : String(v);
  if (typeof v === "string") {
    const corto = v.length > MAX_VALOR ? `${v.slice(0, MAX_VALOR)}…` : v;
    return SIN_COMILLAS.has(campo) ? corto : `“${corto}”`;
  }
  return "(dato complejo)";
}

/** Una línea "Campo: antes → después" por cada campo que cambió. */
function diferencias(anterior: Obj | null, nuevo: Obj | null, op: OpcionesDiff = {}): string[] {
  const campos = new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})]);
  const lineas: string[] = [];
  for (const campo of campos) {
    if (IGNORADOS.has(campo)) continue;
    const a = anterior?.[campo];
    const n = nuevo?.[campo];
    if (a === n || JSON.stringify(a ?? null) === JSON.stringify(n ?? null)) continue;
    const nombre = op.etiquetas?.[campo] ?? CAMPOS[campo] ?? campo;
    lineas.push(
      `${nombre}: ${formatearValor(campo, a, op.moneda)} → ${formatearValor(campo, n, op.moneda)}`,
    );
  }
  return lineas;
}

/** Un update sin diferencias visibles igual se explica, no queda en blanco. */
function conFallback(lineas: string[]): string[] {
  return lineas.length > 0 ? lineas : ["Sin cambios en los datos"];
}

/** "Sin acceso → Acceso completo", o `null` si la fila no trae niveles. */
function transicionNivel(anterior: Obj | null, nuevo: Obj | null): string | null {
  const a = texto(anterior?.nivel);
  const n = texto(nuevo?.nivel);
  if (!a && !n) return null;
  return `${a ? nivelLabel(a) : "—"} → ${n ? nivelLabel(n) : "—"}`;
}

/** Nombre visible de un ítem de contenido o de una cuenta de cobro. */
function nombreItem(v: Obj | null): string | null {
  return texto(v?.titulo) ?? texto(v?.nombre) ?? texto(v?.alias) ?? texto(v?.titular);
}

function conNombre(base: string, nombre: string | null): string {
  return nombre ? `${base} “${nombre}”` : base;
}

export function describirAccion(f: FilaAudit, ctx: ContextoAudit): Descripcion {
  const anterior = obj(f.valorAnterior);
  const nuevo = obj(f.valorNuevo);

  switch (f.accion) {
    case "cambiar_nivel": {
      const email = (f.entidadId && ctx.emails.get(f.entidadId)) || "un usuario";
      const motivo = texto(nuevo?.motivo);
      const detalle = [transicionNivel(anterior, nuevo), motivo && `Motivo: ${motivo}`];
      return {
        titulo: `Cambió el nivel de ${email}`,
        detalle: detalle.filter((l): l is string => Boolean(l)),
      };
    }

    case "reprocesar_pago": {
      const pago = f.entidadId ? ctx.pagos.get(f.entidadId) : undefined;
      const transicion = transicionNivel(anterior, nuevo);
      return {
        titulo: pago
          ? `Reprocesó el pago de ${formatearPrecio.format(pago.monto)} de ${pago.email ?? "un usuario"}`
          : "Reprocesó un pago",
        detalle: transicion ? [`Nivel: ${transicion}`] : [],
      };
    }

    case "crear_contenido":
    case "editar_contenido":
    case "borrar_contenido":
    case "crear_cuenta_cobro":
    case "editar_cuenta_cobro": {
      const verbo = VERBOS[f.accion.split("_")[0]];
      const objeto = OBJETOS[f.entidad] ?? `un ítem de ${f.entidad}`;
      const titulo = conNombre(`${verbo} ${objeto}`, nombreItem(nuevo) ?? nombreItem(anterior));
      const esEdicion = f.accion.startsWith("editar_");
      return { titulo, detalle: esEdicion ? conFallback(diferencias(anterior, nuevo)) : [] };
    }

    // Foto de perfil (specs/foto-perfil-agentes-profesionales): sin detalle — el
    // único dato que cambia es la ruta del archivo, que no le dice nada al admin.
    case "cambiar_foto_contenido":
    case "quitar_foto_contenido": {
      const verbo = f.accion === "cambiar_foto_contenido" ? "Cambió" : "Quitó";
      const objeto = OBJETOS[f.entidad] ?? `un ítem de ${f.entidad}`;
      const de = objeto.startsWith("el ") ? `del ${objeto.slice(3)}` : `de ${objeto}`;
      return {
        titulo: conNombre(`${verbo} la foto ${de}`, nombreItem(nuevo) ?? nombreItem(anterior)),
        detalle: [],
      };
    }

    case "reordenar_contenido": {
      const n = Array.isArray(f.valorNuevo) ? f.valorNuevo.length : 0;
      // VGRP-88: se reordenan videos y materiales; cada uno con su sustantivo.
      const esMaterial = f.entidad === "materiales";
      const [singular, plural, titulo] = esMaterial
        ? ["material", "materiales", "Reordenó los materiales"]
        : ["video", "videos", "Reordenó los videos"];
      return {
        titulo,
        detalle:
          n === 0 ? [] : [n === 1 ? `1 ${singular} reordenado` : `${n} ${plural} reordenados`],
      };
    }

    case "actualizar_config": {
      const config = CONFIG[f.entidadId ?? ""];
      return {
        titulo: config?.titulo ?? "Cambió la configuración",
        detalle: conFallback(diferencias(anterior, nuevo, config)),
      };
    }

    case "activar_cuenta_cobro": {
      const titulo = conNombre("Activó la cuenta de cobro", nombreItem(nuevo));
      if (!anterior) return { titulo, detalle: ["No había otra cuenta activa"] };
      if (anterior.id === nuevo?.id) return { titulo, detalle: ["Ya era la cuenta activa"] };
      return { titulo, detalle: [conNombre("Reemplaza a", nombreItem(anterior))] };
    }

    default:
      return { titulo: `${f.accion} · ${f.entidad}`, detalle: diferencias(anterior, nuevo) };
  }
}
