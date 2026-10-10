// Texto de "Enviar por WhatsApp" del resultado marítimo, mismo criterio que el
// del courier (whatsappCourier.ts): lo recibe VEGROUP (whatsappVegroup.ts), así
// que dice de entrada qué se cotizó (servicio, producto, ruta, carga) y después
// los mismos números que ve el usuario en pantalla: costo real (sin IVA) y
// total a pagar de las dos opciones. No es el mensaje al despachante
// (MaritimoResultado → textoWhatsapp), que pide la tarifa del full y queda
// como estaba.
//
// Función pura, sin React: se testea sola (whatsappMaritimo.test.ts).

import { fmtNum, fmtUSD, type Puerto } from "./tarifasMaritimo";
import type { FiscalMaritimo, ResultadoAmbas } from "./types";

export interface DatosResumenMaritimo {
  refNumber: string;
  producto: string;
  fiscal: FiscalMaritimo;
  puerto: Puerto | undefined;
  res: ResultadoAmbas;
}

export function textoResumenMaritimo({
  refNumber,
  producto,
  fiscal,
  puerto,
  res,
}: DatosResumenMaritimo): string {
  const { consolidado: c, full: f, contenedor, fullEsEstimado } = res;
  const cantidad = contenedor.cantidad > 1 ? `${contenedor.cantidad} × ` : "";
  return [
    "Hola! Les paso una cotización de importación marítima que hice en la calculadora de OG Circle.",
    `*Cotización N° ${refNumber}*`,
    "",
    "*QUÉ SE COTIZÓ*",
    "• Servicio: Importación marítima (consolidado LCL y contenedor completo FCL)",
    producto.trim() ? `• Producto: ${producto.trim()}` : null,
    fiscal.sim
      ? `• Posición arancelaria (SIM): ${fiscal.sim} — DIE ${fiscal.die}% · TE ${fiscal.te}% · IVA ${fiscal.iva}%`
      : null,
    puerto
      ? `• Ruta: ${puerto.label} (${puerto.pais}) → Buenos Aires · tránsito estimado ${puerto.transito} días`
      : null,
    "",
    "*LA CARGA*",
    `• Volumen: ${fmtNum(c.medidas.m3, 3)} m³ · Peso: ${fmtNum(c.medidas.kg, 0)} kg`,
    `• Valor de la mercadería (FOB): ${fmtUSD(c.despacho.fob)} · Unidades: ${c.unidades}`,
    "",
    "*RESULTADO*",
    `• *Consolidado (LCL): costo real ${fmtUSD(c.totales.costos)}* (sin IVA) · total a pagar ${fmtUSD(c.totales.aPagar)}`,
    `   Por unidad: ${fmtUSD(c.totales.costoPorUnidad)}`,
    `• *Full (FCL, ${cantidad}${contenedor.label}): costo real ${fmtUSD(f.totales.costos)}* (sin IVA) · total a pagar ${fmtUSD(f.totales.aPagar)}${
      fullEsEstimado ? " (estimado: la tarifa firme del flete se cotiza aparte)" : ""
    }`,
    `   Por unidad: ${fmtUSD(f.totales.costoPorUnidad)}`,
    "",
    "Quedo atento/a para avanzar con este envío. ¡Gracias!",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
