"use client";

// VGRP-62 — alta/edición de una cuenta de cobro. Mismo mecanismo que
// app/admin/contenido/[entidad]/ContenidoForm.tsx (fetch a la API -> volver al
// listado), con una diferencia: acá la validación real es del servidor (CUIT con
// dígito verificador, CBU/CVU de 22 dígitos, alias), y el form sólo muestra el
// primer error de cada campo que devuelve.

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { Button, FormError } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import styles from "../admin.module.css";

type CampoCuenta = "titular" | "cuit" | "banco" | "cbu_cvu" | "alias" | "notas";
type ValoresCuenta = Record<CampoCuenta, string>;

interface CampoConfig {
  name: CampoCuenta;
  label: string;
  ayuda?: string;
  requerido?: boolean;
  tipo: "text" | "textarea";
  inputMode?: "numeric";
}

const CAMPOS: CampoConfig[] = [
  { name: "titular", label: "Titular", tipo: "text", requerido: true },
  {
    name: "cuit",
    label: "CUIT / CUIL del titular",
    ayuda: "Con o sin guiones. Se valida el dígito verificador.",
    tipo: "text",
    inputMode: "numeric",
    requerido: true,
  },
  { name: "banco", label: "Banco o billetera", tipo: "text", requerido: true },
  {
    name: "cbu_cvu",
    label: "CBU / CVU",
    ayuda: "22 dígitos. Es el dato al que los usuarios van a transferir: revisalo dos veces.",
    tipo: "text",
    inputMode: "numeric",
    requerido: true,
  },
  {
    name: "alias",
    label: "Alias",
    ayuda: "Entre 6 y 20 caracteres: letras, números, punto o guion.",
    tipo: "text",
    requerido: true,
  },
  {
    name: "notas",
    label: "Notas",
    ayuda: "Opcional. Cualquier dato extra que el usuario tenga que ver.",
    tipo: "textarea",
  },
];

export interface CuentaFormProps {
  /** Presente = editar; ausente = crear. */
  cuenta?: Pick<Tables<"cuentas_cobro">, "id" | CampoCuenta>;
}

interface RespuestaError {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export function CuentaForm({ cuenta }: CuentaFormProps) {
  const router = useRouter();
  const [valores, setValores] = useState(
    () => Object.fromEntries(CAMPOS.map((c) => [c.name, cuenta?.[c.name] ?? ""])) as ValoresCuenta,
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setErroresCampo({});

    try {
      const res = await fetch(cuenta ? `/api/admin/cuentas/${cuenta.id}` : "/api/admin/cuentas", {
        method: cuenta ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valores),
      });

      if (res.ok) {
        router.push("/admin/cuentas");
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      const primerError: Record<string, string> = {};
      for (const [campo, mensajes] of Object.entries(data.fieldErrors ?? {})) {
        if (mensajes?.[0]) primerError[campo] = mensajes[0];
      }
      setErroresCampo(primerError);
      setError(data.error ?? "No se pudo guardar.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
    }
  }

  // Lo común a input y textarea: valor controlado + la ayuda y el error del
  // campo asociados al control, para que se anuncien junto a él.
  function propsCampo(campo: CampoConfig) {
    const errorCampo = erroresCampo[campo.name];
    const describedby = [campo.ayuda && `ayuda-${campo.name}`, errorCampo && `error-${campo.name}`]
      .filter(Boolean)
      .join(" ");
    return {
      value: valores[campo.name],
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setValores((v) => ({ ...v, [campo.name]: e.target.value })),
      "aria-invalid": errorCampo ? true : undefined,
      "aria-describedby": describedby || undefined,
    };
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={onSubmit} noValidate>
      {CAMPOS.map((campo) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: el control (input/textarea) SIEMPRE está anidado adentro, en una de las dos ramas del ternario de abajo — el linter no sigue esa cadena para confirmarlo.
        <label key={campo.name} className={styles.formCampo}>
          <span className={styles.formLabel}>
            {campo.label}
            {campo.requerido ? " *" : ""}
          </span>
          {campo.ayuda ? (
            <span id={`ayuda-${campo.name}`} className={styles.formAyuda}>
              {campo.ayuda}
            </span>
          ) : null}

          {campo.tipo === "textarea" ? (
            <textarea className={styles.textareaNativo} {...propsCampo(campo)} />
          ) : (
            <input
              type="text"
              className={styles.inputNativo}
              inputMode={campo.inputMode}
              autoComplete="off"
              {...propsCampo(campo)}
            />
          )}

          {erroresCampo[campo.name] ? (
            <FormError id={`error-${campo.name}`}>{erroresCampo[campo.name]}</FormError>
          ) : null}
        </label>
      ))}

      <FormError>{error}</FormError>

      <div className={styles.formAcciones}>
        <Button type="submit" loading={enviando}>
          {cuenta ? "Guardar cambios" : "Crear cuenta"}
        </Button>
      </div>
    </form>
  );
}
