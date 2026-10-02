"use client";

// VGRP-40 — Edición de precios, con paso de confirmación inline (US-4: nunca
// se escribe sin que el admin vea "valor anterior → valor nuevo" y confirme
// explícitamente). Fetch/estado vía useAdminMutation (../useAdminMutation) —
// ver design.md specs/bloque-10-pendientes/design-vgrp40.md §Trade-offs para
// por qué es un paso inline y no un modal (el repo no tiene ningún primitive
// de Dialog hoy).
//
// VGRP-59/60 (Bloque 13 — plan único): `precios` y `plan` (nombre comercial)
// son dos claves completas DISTINTAS en Edge Config — el PATCH de
// /api/admin/config acepta exactamente una por request (nunca un merge
// parcial). Antes esta pantalla era un solo formulario con dos campos
// (Principiante/Avanzado) que mandaban juntos la única clave `precios`; ahora
// son dos campos que pertenecen a dos claves distintas, así que pasan a ser
// dos SUB-FORMULARIOS independientes, cada uno con su propio paso "Revisar
// cambios" y su propio submit — mismo patrón que ya separa PreciosForm de
// FlagsForm a nivel de componente, sólo que acá conviven en un único archivo
// porque comparten la sección "Precios" de la pantalla y el admin los percibe
// como una sola unidad de edición.

import { type FormEvent, useState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import type { Config } from "@/lib/config/schema";
import { configSchema } from "@/lib/config/schema";
import { formatearPrecio } from "@/lib/format";
import styles from "../admin.module.css";
import { useAdminMutation } from "../useAdminMutation";

type Precios = Config["precios"];
type Plan = Config["plan"];

const PRECIO_FIELD_SCHEMA = configSchema.shape.precios.shape.plan;
const NOMBRE_FIELD_SCHEMA = configSchema.shape.plan.shape.nombre;

function precioValido(v: string): boolean {
  if (v.trim() === "") return false;
  return PRECIO_FIELD_SCHEMA.safeParse(Number(v)).success;
}

function nombreValido(v: string): boolean {
  return NOMBRE_FIELD_SCHEMA.safeParse(v).success;
}

function PrecioPlanForm({ preciosIniciales }: { preciosIniciales: Precios }) {
  const [plan, setPlan] = useState(String(preciosIniciales.plan));
  const [confirmando, setConfirmando] = useState(false);
  const { enviando, refrescando, error, ok, setError, submit } = useAdminMutation<
    { precios: Precios },
    { valorNuevo: Precios }
  >({
    url: "/api/admin/config",
    mensajeOk: "Precio actualizado.",
    extraerError: (data) => data.fieldErrors?.precios?.[0],
  });

  const formValido = precioValido(plan);

  function pedirConfirmacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!formValido) return;
    setConfirmando(true);
  }

  function cancelar() {
    setConfirmando(false);
  }

  async function confirmar() {
    const resultado = await submit({ precios: { plan: Number(plan) } });
    if (resultado) setConfirmando(false);
  }

  if (confirmando) {
    const cambio = preciosIniciales.plan !== Number(plan);

    return (
      <div className={styles.confirmacion}>
        <p className={styles.confirmacionTitulo}>Confirmar cambio de precio</p>
        {!cambio ? (
          <p className={styles.lede}>No hay cambios respecto al valor actual.</p>
        ) : (
          <ul className={styles.confirmacionLista}>
            <li className={styles.confirmacionValor}>
              <strong>Precio del plan:</strong> {formatearPrecio.format(preciosIniciales.plan)} →{" "}
              {formatearPrecio.format(Number(plan))}
            </li>
          </ul>
        )}
        <div className={styles.formAcciones}>
          <Button
            type="button"
            onClick={confirmar}
            loading={enviando || refrescando}
            disabled={!cambio}
          >
            Confirmar
          </Button>
          <Button type="button" variant="ghost" onClick={cancelar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
        <FormError>{error}</FormError>
      </div>
    );
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={pedirConfirmacion}>
      <TextField
        label="Precio del plan (ARS)"
        type="number"
        min={1}
        step={1}
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        error={plan !== "" && !formValido ? "Tiene que ser un entero mayor a cero." : null}
      />
      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}
      <Button type="submit" disabled={!formValido}>
        Revisar cambios
      </Button>
    </form>
  );
}

function NombrePlanForm({ planIniciales }: { planIniciales: Plan }) {
  const [nombre, setNombre] = useState(planIniciales.nombre);
  const [confirmando, setConfirmando] = useState(false);
  const { enviando, refrescando, error, ok, setError, submit } = useAdminMutation<
    { plan: Plan },
    { valorNuevo: Plan }
  >({
    url: "/api/admin/config",
    mensajeOk: "Nombre del plan actualizado.",
    extraerError: (data) => data.fieldErrors?.plan?.[0],
  });

  const formValido = nombreValido(nombre);

  function pedirConfirmacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!formValido) return;
    setConfirmando(true);
  }

  function cancelar() {
    setConfirmando(false);
  }

  async function confirmar() {
    const resultado = await submit({ plan: { nombre: nombre.trim() } });
    if (resultado) setConfirmando(false);
  }

  if (confirmando) {
    const cambio = planIniciales.nombre !== nombre.trim();

    return (
      <div className={styles.confirmacion}>
        <p className={styles.confirmacionTitulo}>Confirmar cambio de nombre del plan</p>
        {!cambio ? (
          <p className={styles.lede}>No hay cambios respecto al valor actual.</p>
        ) : (
          <ul className={styles.confirmacionLista}>
            <li className={styles.confirmacionValor}>
              <strong>Nombre del plan:</strong> {planIniciales.nombre} → {nombre.trim()}
            </li>
          </ul>
        )}
        <div className={styles.formAcciones}>
          <Button
            type="button"
            onClick={confirmar}
            loading={enviando || refrescando}
            disabled={!cambio}
          >
            Confirmar
          </Button>
          <Button type="button" variant="ghost" onClick={cancelar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
        <FormError>{error}</FormError>
      </div>
    );
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={pedirConfirmacion}>
      <TextField
        label="Nombre del plan"
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        error={nombre !== "" && !formValido ? "No puede estar vacío." : null}
      />
      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}
      <Button type="submit" disabled={!formValido}>
        Revisar cambios
      </Button>
    </form>
  );
}

export function PreciosForm({
  preciosIniciales,
  planIniciales,
}: {
  preciosIniciales: Precios;
  planIniciales: Plan;
}) {
  return (
    <div className={styles.formCambiarNivel}>
      <PrecioPlanForm preciosIniciales={preciosIniciales} />
      <NombrePlanForm planIniciales={planIniciales} />
    </div>
  );
}
