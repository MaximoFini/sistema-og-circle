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
//
// VGRP-78 — lo usan `/comprar` y la tarjeta de desbloqueo de `/dashboard` y
// `/calculadora` (que así cobra desde ahí, sin pasar por `/comprar`). El
// teléfono: `/comprar` sabe si falta y lo pide de entrada (`pedirTelefono`);
// la tarjeta vive en páginas estáticas que no leen el perfil, así que el campo
// aparece recién cuando `crearCheckout` responde que falta.

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { TextField } from "@/components/ui/TextField";
import { telefonoValido } from "@/lib/forms/telefono";
import type { NivelComprable } from "@/lib/mercadopago/preferencia";
import { type CrearCheckoutResult, crearCheckout } from "./_actions";
import styles from "./ComprarButton.module.css";

export interface ComprarButtonProps {
  nivel: NivelComprable;
  /** VGRP-78 — ya se sabe que el perfil no tiene teléfono: se pide de entrada. */
  pedirTelefono?: boolean;
}

export function ComprarButton({ nivel, pedirTelefono = false }: ComprarButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [telefono, setTelefono] = useState("");
  // `campo: "telefono"` va debajo del campo; el resto, debajo del botón.
  const [error, setError] = useState<Extract<CrearCheckoutResult, { ok: false }> | null>(null);
  const errorTelefono = error?.campo === "telefono" ? error.error : null;
  // Visible desde el inicio (`pedirTelefono`) o desde que el servidor dijo
  // que falta; no se deriva de `error`, que se limpia en cada intento.
  const [mostrarTelefono, setMostrarTelefono] = useState(pedirTelefono);
  const compraRef = useRef<HTMLDivElement>(null);

  // Si el campo aparece recién ahora (tarjeta de desbloqueo), se enfoca y se
  // trae a la vista junto con el botón: en pantallas bajas la tarjeta scrollea
  // por dentro y quedaría fuera de vista.
  useEffect(() => {
    if (!mostrarTelefono || pedirTelefono) return;
    compraRef.current?.querySelector("input")?.focus({ preventScroll: true });
    compraRef.current?.scrollIntoView({ block: "nearest" });
  }, [mostrarTelefono, pedirTelefono]);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await crearCheckout(nivel, mostrarTelefono ? telefono : undefined);
      if (!result.ok) {
        if (result.campo === "telefono") setMostrarTelefono(true);
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
    <div ref={compraRef} className={styles.compra}>
      {mostrarTelefono ? (
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
        disabled={mostrarTelefono && !telefonoValido(telefono)}
        onClick={handleClick}
      >
        Comprar acceso
      </Button>
      <FormError>{errorTelefono ? null : error?.error}</FormError>
    </div>
  );
}
