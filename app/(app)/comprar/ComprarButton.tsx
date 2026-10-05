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
import { Button, FormError, TextField } from "@/components/ui";
import { telefonoValido } from "@/lib/forms/telefono";
import type { NivelComprable } from "@/lib/mercadopago/preferencia";
import { type CrearCheckoutResult, crearCheckout } from "./_actions";

export interface ComprarButtonProps {
  nivel: NivelComprable;
  /** VGRP-78 — el perfil no tiene teléfono: se pide antes de pagar. */
  pedirTelefono?: boolean;
}

export function ComprarButton({ nivel, pedirTelefono = false }: ComprarButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [telefono, setTelefono] = useState("");
  // `campo: "telefono"` va debajo del campo; el resto, debajo del botón.
  const [error, setError] = useState<Extract<CrearCheckoutResult, { ok: false }> | null>(null);
  const errorTelefono = error?.campo === "telefono" ? error.error : null;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await crearCheckout(nivel, pedirTelefono ? telefono : undefined);
      if (!result.ok) {
        setError(result);
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
      {pedirTelefono ? (
        <TextField
          name="telefono"
          type="tel"
          label="Teléfono de contacto"
          hint="Lo usamos solo para contactarte por tu compra."
          autoComplete="tel"
          inputMode="tel"
          required
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          error={errorTelefono}
        />
      ) : null}
      <Button
        variant="primary"
        fullWidth
        loading={isPending}
        disabled={pedirTelefono && !telefonoValido(telefono)}
        onClick={handleClick}
      >
        Comprar acceso
      </Button>
      <FormError>{errorTelefono ? null : error?.error}</FormError>
    </>
  );
}
