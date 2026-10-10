// Texto de "Enviar por WhatsApp" del courier. Lo recibe VEGROUP (ver
// whatsappVegroup.ts): tiene que decir de entrada QUÉ servicio, producto y
// envío se cotizó, y después el resultado con los mismos números que ve el
// usuario en pantalla (costo real sin IVA como número principal, el total con
// IVA aparte). El mismo orden y las mismas cifras que la hoja del PDF.
//
// Función pura, sin React: se testea sola (whatsappCourier.test.ts).

import { costoRealPorKg, fmtARS, fmtUSD, INTEGRAL_THRESHOLD, INTEGRAL_VOL_RATE } from "./calc";
import type { PosicionElegida, Regimen, ResultadoIntegral, ResultadoRuta } from "./types";

/** Nombre del servicio tal como lo elige el usuario, con lo que cambia entre uno y otro. */
export const SERVICIO_COURIER: Record<Regimen, string> = {
  general: "Courier comercial (régimen general, con aranceles)",
  pequeños: "Courier — Pequeños envíos (régimen simplificado, franquicia)",
  integral: "Courier integral (todo incluido, tarifa por kg, sin aranceles)",
};

const SALUDO =
  "Hola! Les paso una cotización de importación que hice en la calculadora de OG Circle.";

const CIERRE = "Quedo atento/a para avanzar con este envío. ¡Gracias!";

/** Datos del formulario que viajan en el mensaje (todo en texto, como en el formulario). */
export interface FormularioWhatsapp {
  fob: string;
  pesoKg: string;
  unidades: string;
  cajas: number;
  largo: string;
  ancho: string;
  alto: string;
}

export interface DatosWhatsappCourier {
  refNumber: string;
  regimen: Exclude<Regimen, "integral">;
  producto: string;
  selected: PosicionElegida;
  form: FormularioWhatsapp;
  result: ResultadoRuta;
}

export interface DatosWhatsappIntegral {
  refNumber: string;
  producto: string;
  form: Pick<FormularioWhatsapp, "pesoKg" | "unidades" | "cajas" | "largo" | "ancho" | "alto">;
  result: ResultadoIntegral;
  dolarBN: number | null;
}

const kg = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })} kg`;

function medidas(f: Pick<FormularioWhatsapp, "cajas" | "largo" | "ancho" | "alto">): string {
  const caja = `${f.largo} × ${f.ancho} × ${f.alto} cm`;
  return f.cajas === 1 ? `1 caja de ${caja}` : `${f.cajas} cajas de ${caja} cada una`;
}

/** Líneas de la posición arancelaria: DIE/TE/IVA (y II si lo hay). */
function alicuotas(p: PosicionElegida): string {
  const ii = Number(p.impInternos) > 0 ? ` · II ${p.impInternos}%` : "";
  return `DIE ${p.die}% · TE ${p.te}% · IVA ${p.iva}%${ii}`;
}

export function textoCourier({
  refNumber,
  regimen,
  producto,
  selected,
  form,
  result: r,
}: DatosWhatsappCourier): string {
  const conPesos = r.proveedorPesos != null && r.destinoPesos != null;
  const costoRealPesos = conPesos ? (r.proveedorPesos ?? 0) + (r.destinoPesos ?? 0) : null;
  const ivaPesos = r.ivaPesos;

  return [
    SALUDO,
    `*Cotización N° ${refNumber}*`,
    "",
    "*QUÉ SE COTIZÓ*",
    `• Servicio: ${SERVICIO_COURIER[regimen]}`,
    `• Producto: ${producto.trim() || "—"}`,
    `• Posición arancelaria (NCM): ${selected.sim} — ${alicuotas(selected)}`,
    `• Depósito de origen: ${r.label} (${r.pais}) · tiempo estimado ${r.tiempoEstimado}`,
    "",
    "*EL ENVÍO*",
    `• Valor de la mercadería (FOB): ${fmtUSD(Number(form.fob))}`,
    `• Peso: ${form.pesoKg} kg · Unidades: ${form.unidades || "1"}`,
    `• Bultos: ${medidas(form)}`,
    r.volumen > 0
      ? `• Ojo: el peso volumétrico (${kg(r.pesoVolumetrico)}) supera al real; se cobran ${kg(r.volumen)} de exceso.`
      : null,
    "",
    "*RESULTADO*",
    `• *Costo real puesto en Argentina (sin IVA recuperable): ${fmtUSD(r.costoRealEfectivo)}*${
      costoRealPesos != null ? ` (${fmtARS(costoRealPesos)})` : ""
    }`,
    `   Por unidad: ${fmtUSD(r.costoPorUnidad)} · Por kg: ${fmtUSD(costoRealPorKg(r))}`,
    `• Total a pagar (con IVA): ${fmtUSD(r.totalUSD)}${
      r.totalPesos != null ? ` (${fmtARS(r.totalPesos)})` : ""
    }`,
    `   Proveedor: ${fmtUSD(r.fob)}${r.proveedorPesos != null ? ` (${fmtARS(r.proveedorPesos)} al CCL $${r.dolarCCL})` : ""}`,
    `   Gastos en destino (sin IVA): ${fmtUSD(r.totalGastosDestino)}${r.destinoPesos != null ? ` (${fmtARS(r.destinoPesos)} al BNA $${r.dolarBN})` : ""}`,
    `   IVA (crédito fiscal recuperable): ${fmtUSD(r.recuperable.iva)}${ivaPesos != null ? ` (${fmtARS(ivaPesos)})` : ""}`,
    "",
    CIERRE,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function textoIntegral({
  refNumber,
  producto,
  form,
  result: r,
  dolarBN,
}: DatosWhatsappIntegral): string {
  const tarifa = `${fmtUSD(r.rate)}/kg (${r.pesoReal >= INTEGRAL_THRESHOLD ? "desde" : "menos de"} ${INTEGRAL_THRESHOLD} kg)`;
  return [
    SALUDO,
    `*Cotización N° ${refNumber}*`,
    "",
    "*QUÉ SE COTIZÓ*",
    `• Servicio: ${SERVICIO_COURIER.integral}`,
    producto.trim() ? `• Producto: ${producto.trim()}` : null,
    `• Depósito de origen: ${r.label} (${r.pais}) · tiempo estimado ${r.tiempoEstimado}`,
    "",
    "*EL ENVÍO*",
    `• Peso: ${form.pesoKg} kg${form.unidades ? ` · Unidades: ${form.unidades}` : ""}`,
    `• Bultos: ${medidas(form)}`,
    r.excesoVol > 0
      ? `• Ojo: el peso volumétrico (${kg(r.pesoVolumetrico)}) supera al real; se cobran ${kg(r.excesoVol)} de exceso a ${fmtUSD(INTEGRAL_VOL_RATE)}/kg.`
      : null,
    "",
    "*RESULTADO*",
    `• Tarifa: ${tarifa}`,
    `• *Total a pagar: ${fmtUSD(r.totalUSD)}*${r.totalPesos != null ? ` (${fmtARS(r.totalPesos)}${dolarBN ? ` al BNA $${dolarBN}` : ""})` : ""}`,
    `   Por kg: ${fmtUSD(r.costoPorKg)}${Number(form.unidades) > 0 ? ` · Por unidad: ${fmtUSD(r.costoPorUnidad)}` : ""}`,
    "",
    CIERRE,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
