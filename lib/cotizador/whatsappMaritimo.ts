// VGRP-69 — texto de "Enviar por WhatsApp" del resultado marítimo, mismo
// criterio que el del courier (CotizadorCourier → whatsappText): los mismos
// números que se ven en pantalla, sin número de destino (el usuario elige a
// quién mandarlo). No es el mensaje al despachante (MaritimoResultado →
// textoWhatsapp), que pide la tarifa del full y queda como estaba.
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
  /** `links.whatsapp` de la config. */
  whatsappContacto: string;
}

export function textoResumenMaritimo({
  refNumber,
  producto,
  fiscal,
  puerto,
  res,
  whatsappContacto,
}: DatosResumenMaritimo): string {
  const { consolidado: c, full: f, contenedor, fullEsEstimado } = res;
  const cantidad = contenedor.cantidad > 1 ? `${contenedor.cantidad} × ` : "";
  return [
    `*OG Circle — Cotización marítima ${refNumber}*`,
    producto.trim() ? `Producto: ${producto.trim()}` : null,
    fiscal.sim ? `Posición SIM: ${fiscal.sim}` : null,
    `Carga: ${fmtNum(c.medidas.m3, 3)} m³ · ${fmtNum(c.medidas.kg, 0)} kg${
      puerto ? ` · ${puerto.label} → Buenos Aires` : ""
    }`,
    "",
    `*Consolidado (LCL):* ${fmtUSD(c.totales.costos)} costo real · ${fmtUSD(c.totales.aPagar)} a pagar`,
    `*Full (FCL, ${cantidad}${contenedor.label}):* ${fmtUSD(f.totales.costos)} costo real · ${fmtUSD(
      f.totales.aPagar,
    )} a pagar${fullEsEstimado ? " (estimado)" : ""}`,
    "",
    `OG Circle · ${whatsappContacto}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
