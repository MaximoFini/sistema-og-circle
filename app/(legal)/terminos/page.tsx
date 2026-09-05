import type { Metadata } from "next";
import { LegalDocPage } from "../LegalDocPage";

export const metadata: Metadata = { title: "Términos y Condiciones — OG Circle" };

// VGRP-34 — placeholder de Términos y Condiciones. El texto real lo entrega
// Jota (PRD Fase 2 §8): esto es la maqueta, marcada como tal, con la
// estructura que ese texto va a ocupar. No se lanza con este contenido — ver
// el criterio de aceptación en el ticket. El chrome (link de vuelta, título,
// callout de placeholder) vive en `../LegalDocPage.tsx`, compartido con
// `/privacidad` y `/reembolsos`.
export default function TerminosPage() {
  return (
    <LegalDocPage title="Términos y Condiciones">
      <h2>1. Qué es OG Circle</h2>
      <p>
        [Placeholder] Descripción del servicio: acceso pago, de por vida, a formación e
        infraestructura operativa de importación (agentes de compra, depósitos, flete, SWIFT,
        calculadora de costos).
      </p>

      <h2>2. Niveles de acceso y pago</h2>
      <p>
        [Placeholder] Principiante y Avanzado, pago único, sin suscripción. Qué desbloquea cada
        nivel, y que los precios pueden cambiar hacia adelante sin afectar compras ya hechas.
      </p>

      <h2>3. Uso de la infraestructura de terceros</h2>
      <p>
        [Placeholder] Los datos de agentes de compra, depósitos y SWIFT son información provista por
        terceros; OG Circle facilita el acceso, no garantiza el resultado de cada operación de
        importación.
      </p>

      <h2>4. Cuenta y responsabilidad del usuario</h2>
      <p>
        [Placeholder] Veracidad de los datos de registro, uso personal e intransferible de la
        cuenta, prohibición de compartir contenido restringido (contactos de agentes, datos SWIFT)
        con quien no pagó ese nivel.
      </p>

      <h2>5. Modificaciones</h2>
      <p>
        [Placeholder] Cómo y cuándo puede cambiar este texto, y que la versión aceptada por cada
        usuario queda registrada.
      </p>
    </LegalDocPage>
  );
}
