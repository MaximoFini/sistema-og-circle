import type { Json } from "@/lib/database.types";
import { nivelLabel } from "../pagos/estados";

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

function monto(ars: number): string {
  return ars.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

// Tipo de contenido -> [artículo + sustantivo]. Las entidades son la lista
// blanca de lib/data/admin/contenido.ts (`ENTIDADES`).
const TIPOS_CONTENIDO: Record<string, string> = {
  videos: "el video",
  agentes: "el agente",
  profesionales: "el profesional",
  servicios_financieros: "el servicio financiero",
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

const MAX_VALOR = 60;

function formatearValor(campo: string, v: Json | undefined, clave?: string): string {
  if (v === null || v === undefined || v === "") return "vacío";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return clave === "precios" ? monto(v) : String(v);
  if (typeof v === "string") {
    const corto = v.length > MAX_VALOR ? `${v.slice(0, MAX_VALOR)}…` : v;
    return campo === "fase" ? corto : `“${corto}”`;
  }
  return "(dato complejo)";
}

function nombreCampo(campo: string, clave?: string): string {
  if (clave === "precios" && campo === "plan") return "Precio del plan";
  if (clave === "plan" && campo === "nombre") return "Nombre del plan";
  return CAMPOS[campo] ?? campo;
}

/** Una línea "Campo: antes → después" por cada campo que cambió. */
function diferencias(anterior: Obj | null, nuevo: Obj | null, clave?: string): string[] {
  const campos = new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})]);
  const lineas: string[] = [];
  for (const campo of campos) {
    if (IGNORADOS.has(campo)) continue;
    const a = anterior?.[campo];
    const n = nuevo?.[campo];
    if (JSON.stringify(a ?? null) === JSON.stringify(n ?? null)) continue;
    lineas.push(
      `${nombreCampo(campo, clave)}: ${formatearValor(campo, a, clave)} → ${formatearValor(campo, n, clave)}`,
    );
  }
  return lineas;
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
      const detalle: string[] = [];
      const nivelA = texto(anterior?.nivel);
      const nivelN = texto(nuevo?.nivel);
      if (nivelA || nivelN) {
        detalle.push(`${nivelA ? nivelLabel(nivelA) : "—"} → ${nivelN ? nivelLabel(nivelN) : "—"}`);
      }
      const motivo = texto(nuevo?.motivo);
      if (motivo) detalle.push(`Motivo: ${motivo}`);
      return { titulo: `Cambió el nivel de ${email}`, detalle };
    }

    case "reprocesar_pago": {
      const pago = f.entidadId ? ctx.pagos.get(f.entidadId) : undefined;
      const titulo = pago
        ? `Reprocesó el pago de ${monto(pago.monto)} de ${pago.email ?? "un usuario"}`
        : "Reprocesó un pago";
      const nivelA = texto(anterior?.nivel);
      const nivelN = texto(nuevo?.nivel);
      const detalle =
        nivelA || nivelN
          ? [`Nivel: ${nivelA ? nivelLabel(nivelA) : "—"} → ${nivelN ? nivelLabel(nivelN) : "—"}`]
          : [];
      return { titulo, detalle };
    }

    case "crear_contenido":
    case "editar_contenido":
    case "borrar_contenido": {
      const tipo = TIPOS_CONTENIDO[f.entidad] ?? `un ítem de ${f.entidad}`;
      const verbo =
        f.accion === "crear_contenido"
          ? "Creó"
          : f.accion === "editar_contenido"
            ? "Editó"
            : "Borró";
      const titulo = conNombre(`${verbo} ${tipo}`, nombreItem(nuevo) ?? nombreItem(anterior));
      if (f.accion !== "editar_contenido") return { titulo, detalle: [] };
      const detalle = diferencias(anterior, nuevo);
      return {
        titulo,
        detalle: detalle.length > 0 ? detalle : ["Sin cambios en los datos"],
      };
    }

    case "reordenar_contenido": {
      const cantidad = Array.isArray(f.valorNuevo) ? f.valorNuevo.length : null;
      return {
        titulo: "Reordenó los videos",
        detalle: cantidad
          ? [`${cantidad} video${cantidad === 1 ? "" : "s"} reordenado${cantidad === 1 ? "" : "s"}`]
          : [],
      };
    }

    case "actualizar_config": {
      const clave = f.entidadId ?? "";
      const titulos: Record<string, string> = {
        precios: "Cambió el precio",
        plan: "Cambió el nombre del plan",
        flags: "Cambió la configuración de la plataforma",
      };
      const detalle = diferencias(anterior, nuevo, clave);
      return {
        titulo: titulos[clave] ?? "Cambió la configuración",
        detalle: detalle.length > 0 ? detalle : ["Sin cambios en los valores"],
      };
    }

    case "crear_cuenta_cobro":
      return {
        titulo: conNombre("Creó la cuenta de cobro", nombreItem(nuevo)),
        detalle: [],
      };

    case "editar_cuenta_cobro": {
      const detalle = diferencias(anterior, nuevo);
      return {
        titulo: conNombre("Editó la cuenta de cobro", nombreItem(nuevo) ?? nombreItem(anterior)),
        detalle: detalle.length > 0 ? detalle : ["Sin cambios en los datos"],
      };
    }

    case "activar_cuenta_cobro": {
      const titulo = conNombre("Activó la cuenta de cobro", nombreItem(nuevo));
      if (!anterior) return { titulo, detalle: ["No había otra cuenta activa"] };
      if (anterior.id === nuevo?.id) return { titulo, detalle: ["Ya era la cuenta activa"] };
      return {
        titulo,
        detalle: [conNombre("Reemplaza a", nombreItem(anterior))],
      };
    }

    default:
      return {
        titulo: `${f.accion} · ${f.entidad}`,
        detalle: diferencias(anterior, nuevo),
      };
  }
}
