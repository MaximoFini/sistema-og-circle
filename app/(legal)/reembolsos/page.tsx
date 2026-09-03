import type { Metadata } from "next";
import { LegalDocPage } from "../LegalDocPage";

export const metadata: Metadata = { title: "Política de Reembolsos — OG Circle" };

// VGRP-34 — placeholder de Política de Reembolsos.
//
// A diferencia de Términos y Privacidad, este texto no es libre: tiene que
// describir EXACTAMENTE lo que el sistema hace, no una política aspiracional
// distinta. `nivel_vigente()` en
// supabase/migrations/20260822035923_init_plataforma.sql ya implementa
// revocación automática — cualquier pago con una fila `refunded` para el
// mismo `proveedor_ref` deja de contar, así que el nivel cae solo a
// 'ninguno'. El PRD §8 todavía lista esto como "decisión abierta", pero no
// lo es: es el comportamiento real del código desde VGRP-15. Si el texto
// final que entregue Jota describe otra cosa (por ejemplo, acceso que
// persiste hasta que un admin lo revoque a mano), hay que avisar ANTES de
// publicarlo — el texto legal y el sistema tienen que decir lo mismo.
export default function ReembolsosPage() {
  return (
    <LegalDocPage
      title="Política de Reembolsos"
      placeholderExtra={
        <p>
          <strong>A diferencia de las otras dos páginas</strong>, este texto no puede decir
          cualquier cosa: tiene que coincidir con lo que el sistema hace de verdad (ver el
          comentario en el código fuente de esta página).
        </p>
      }
    >
      <h2>1. Qué pasa si se aprueba un reembolso</h2>
      <p>
        Un reembolso revoca automáticamente el nivel de acceso: apenas Mercado Pago confirma el
        reembolso, el sistema deja de contar ese pago y el acceso vuelve a estar bloqueado, sin
        intervención manual.
      </p>

      <h2>2. Por qué esta política y no otra</h2>
      <p>
        [Placeholder] Lo que se compra —contactos de agentes verificados, datos de depósitos y de
        pago SWIFT— se puede copiar en minutos. Explicar acá, en lenguaje llano, por qué el acceso
        no se mantiene después de un reembolso.
      </p>

      <h2>3. Cómo pedir un reembolso</h2>
      <p>[Placeholder] Canal (soporte por WhatsApp), plazo, y qué información hay que dar.</p>

      <h2>4. Excepciones</h2>
      <p>
        [Placeholder] Si el equipo decide manejar algún caso puntual distinto a mano, cómo se
        documenta y quién lo autoriza.
      </p>
    </LegalDocPage>
  );
}
