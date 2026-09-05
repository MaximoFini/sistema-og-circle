"use client";

// VGRP-22 — Botón de compra por nivel.
//
// Client Component porque necesita estado local (mensaje de error del
// intento anterior, `loading` mientras se crea la preferencia) y porque es
// quien decide navegar tras invocar el Server Action — ver el comentario en
// `_actions.ts` sobre por qué `crearCheckout()` devuelve `{ ok, url }` en vez
// de hacer `redirect()` del lado del servidor.
//
// `crearCheckout` es un Server Action: importarlo acá y llamarlo como una
// función async normal es el patrón soportado por Next 15 para invocar una
// Server Action fuera de un `<form action={...}>` (no hace falta que este
// botón esté dentro de un form).

import { useState, useTransition } from "react";
import { Button, FormError } from "@/components/ui";
import type { NivelComprable } from "@/lib/mercadopago/preferencia";
import { crearCheckout } from "./_actions";

export interface ComprarButtonProps {
  nivel: NivelComprable;
}

export function ComprarButton({ nivel }: ComprarButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await crearCheckout(nivel);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Navegación de salida del sitio (checkout de Mercado Pago): no es una
      // ruta de esta app, así que no aplica `router.push` + Link interno —
      // `window.location.assign` es el reemplazo correcto de un
      // `redirect()` de servidor cuando el destino es externo.
      window.location.assign(result.url);
    });
  }

  return (
    <>
      <Button variant="primary" fullWidth loading={isPending} onClick={handleClick}>
        Comprar nivel {nivel}
      </Button>
      <FormError>{error}</FormError>
    </>
  );
}
