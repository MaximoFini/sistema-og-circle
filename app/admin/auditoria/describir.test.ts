import { describe, expect, it } from "vitest";
import { type ContextoAudit, describirAccion, type FilaAudit } from "./describir";

// Unit tests puros (sin base): cada forma de `valor_anterior`/`valor_nuevo`
// que escribe hoy una mutación del panel (lib/data/admin/*) tiene que salir en
// castellano, sin uuids ni nombres de columnas.

const USER = "11111111-1111-4111-8111-111111111111";
const PAGO = "22222222-2222-4222-8222-222222222222";

const ctx: ContextoAudit = {
  emails: new Map([[USER, "juan@mail.com"]]),
  pagos: new Map([[PAGO, { email: "ana@mail.com", monto: 125000 }]]),
};

function fila(p: Partial<FilaAudit> & Pick<FilaAudit, "accion" | "entidad">): FilaAudit {
  return { entidadId: null, valorAnterior: null, valorNuevo: null, ...p };
}

describe("describirAccion", () => {
  it("cambiar_nivel: email del usuario, niveles legibles y motivo", () => {
    const d = describirAccion(
      fila({
        accion: "cambiar_nivel",
        entidad: "profiles",
        entidadId: USER,
        valorAnterior: { nivel: "ninguno" },
        valorNuevo: { nivel: "completo", motivo: "pagó por transferencia" },
      }),
      ctx,
    );
    expect(d.titulo).toBe("Cambió el nivel de juan@mail.com");
    expect(d.detalle).toEqual(["Sin acceso → Acceso completo", "Motivo: pagó por transferencia"]);
  });

  it("cambiar_nivel de un perfil que ya no existe: no muestra el uuid", () => {
    const d = describirAccion(
      fila({
        accion: "cambiar_nivel",
        entidad: "profiles",
        entidadId: "otro-id",
      }),
      ctx,
    );
    expect(d.titulo).toBe("Cambió el nivel de un usuario");
    expect(JSON.stringify(d)).not.toContain("otro-id");
  });

  it("reprocesar_pago: monto y email del dueño del pago", () => {
    const d = describirAccion(
      fila({
        accion: "reprocesar_pago",
        entidad: "pagos",
        entidadId: PAGO,
        valorAnterior: { nivel: "ninguno" },
        valorNuevo: { nivel: "completo" },
      }),
      ctx,
    );
    expect(d.titulo).toMatch(/^Reprocesó el pago de \$\s?125\.000 de ana@mail\.com$/);
    expect(d.detalle).toEqual(["Nivel: Sin acceso → Acceso completo"]);
  });

  it("crear / borrar contenido: tipo y nombre del ítem", () => {
    expect(
      describirAccion(
        fila({
          accion: "crear_contenido",
          entidad: "videos",
          valorNuevo: { titulo: "Intro" },
        }),
        ctx,
      ).titulo,
    ).toBe("Creó el video “Intro”");
    expect(
      describirAccion(
        fila({
          accion: "borrar_contenido",
          entidad: "agentes",
          valorAnterior: { nombre: "Pepe" },
        }),
        ctx,
      ).titulo,
    ).toBe("Borró el agente “Pepe”");
  });

  it("editar_contenido: sólo los campos que cambiaron, sin columnas de sistema", () => {
    const d = describirAccion(
      fila({
        accion: "editar_contenido",
        entidad: "videos",
        valorAnterior: {
          id: "x",
          titulo: "Viejo",
          publicado: false,
          orden: 1,
          updated_at: "a",
        },
        valorNuevo: {
          id: "x",
          titulo: "Nuevo",
          publicado: true,
          orden: 1,
          updated_at: "b",
        },
      }),
      ctx,
    );
    expect(d.titulo).toBe("Editó el video “Nuevo”");
    expect(d.detalle).toEqual(["Título: “Viejo” → “Nuevo”", "Publicado: No → Sí"]);
  });

  it("editar_contenido sin diferencias", () => {
    const v = { titulo: "Igual", updated_at: "a" };
    const d = describirAccion(
      fila({
        accion: "editar_contenido",
        entidad: "videos",
        valorAnterior: v,
        valorNuevo: { ...v, updated_at: "b" },
      }),
      ctx,
    );
    expect(d.detalle).toEqual(["Sin cambios en los datos"]);
  });

  it("textos largos se recortan", () => {
    const largo = "a".repeat(200);
    const d = describirAccion(
      fila({
        accion: "editar_contenido",
        entidad: "profesionales",
        valorAnterior: { nombre: "N", descripcion: null },
        valorNuevo: { nombre: "N", descripcion: largo },
      }),
      ctx,
    );
    expect(d.detalle[0]).toMatch(/^Descripción: vacío → “a{60}…”$/);
  });

  it("reordenar_contenido: cantidad de videos", () => {
    const d = describirAccion(
      fila({
        accion: "reordenar_contenido",
        entidad: "videos",
        entidadId: "lista",
        valorNuevo: [
          { id: "a", orden: 1 },
          { id: "b", orden: 2 },
        ],
      }),
      ctx,
    );
    expect(d).toEqual({
      titulo: "Reordenó los videos",
      detalle: ["2 videos reordenados"],
    });
  });

  it("actualizar_config precios: monto formateado", () => {
    const d = describirAccion(
      fila({
        accion: "actualizar_config",
        entidad: "config",
        entidadId: "precios",
        valorAnterior: { plan: 100000 },
        valorNuevo: { plan: 125000 },
      }),
      ctx,
    );
    expect(d.titulo).toBe("Cambió el precio");
    expect(d.detalle[0]).toMatch(/^Precio del plan: \$\s?100\.000 → \$\s?125\.000$/);
  });

  it("actualizar_config flags: booleanos como Sí/No y fase sin comillas", () => {
    const d = describirAccion(
      fila({
        accion: "actualizar_config",
        entidad: "config",
        entidadId: "flags",
        valorAnterior: {
          checkout_habilitado: true,
          registro_habilitado: true,
          fase: "1",
        },
        valorNuevo: {
          checkout_habilitado: false,
          registro_habilitado: true,
          fase: "2",
        },
      }),
      ctx,
    );
    expect(d.titulo).toBe("Cambió la configuración de la plataforma");
    expect(d.detalle).toEqual(["Checkout habilitado: Sí → No", "Fase: 1 → 2"]);
  });

  it("actualizar_config sin valor anterior (Edge Config no respondió)", () => {
    const d = describirAccion(
      fila({
        accion: "actualizar_config",
        entidad: "config",
        entidadId: "plan",
        valorNuevo: { nombre: "Plan Oro" },
      }),
      ctx,
    );
    expect(d.titulo).toBe("Cambió el nombre del plan");
    expect(d.detalle).toEqual(["Nombre del plan: vacío → “Plan Oro”"]);
  });

  it("cuentas de cobro: crear, editar y activar", () => {
    const cuenta = {
      id: "c1",
      alias: "og.circle.mp",
      banco: "Galicia",
      cbu_cvu: "000",
      activa: false,
    };
    expect(
      describirAccion(
        fila({
          accion: "crear_cuenta_cobro",
          entidad: "cuentas_cobro",
          valorNuevo: cuenta,
        }),
        ctx,
      ).titulo,
    ).toBe("Creó la cuenta de cobro “og.circle.mp”");

    const editada = describirAccion(
      fila({
        accion: "editar_cuenta_cobro",
        entidad: "cuentas_cobro",
        valorAnterior: cuenta,
        valorNuevo: { ...cuenta, banco: "Nación" },
      }),
      ctx,
    );
    expect(editada.detalle).toEqual(["Banco: “Galicia” → “Nación”"]);

    const otra = { ...cuenta, id: "c2", alias: "vieja.cuenta" };
    expect(
      describirAccion(
        fila({
          accion: "activar_cuenta_cobro",
          entidad: "cuentas_cobro",
          valorAnterior: otra,
          valorNuevo: cuenta,
        }),
        ctx,
      ).detalle,
    ).toEqual(["Reemplaza a “vieja.cuenta”"]);
    expect(
      describirAccion(
        fila({
          accion: "activar_cuenta_cobro",
          entidad: "cuentas_cobro",
          valorNuevo: cuenta,
        }),
        ctx,
      ).detalle,
    ).toEqual(["No había otra cuenta activa"]);
    expect(
      describirAccion(
        fila({
          accion: "activar_cuenta_cobro",
          entidad: "cuentas_cobro",
          valorAnterior: cuenta,
          valorNuevo: cuenta,
        }),
        ctx,
      ).detalle,
    ).toEqual(["Ya era la cuenta activa"]);
  });

  it("acción desconocida: no rompe, cae a una descripción genérica", () => {
    const d = describirAccion(
      fila({
        accion: "algo_nuevo",
        entidad: "cosas",
        valorAnterior: { x: 1 },
        valorNuevo: { x: 2 },
      }),
      ctx,
    );
    expect(d.titulo).toBe("algo_nuevo · cosas");
    expect(d.detalle).toEqual(["x: 1 → 2"]);
  });

  it("valores que no son objetos (null, arrays) no rompen", () => {
    for (const accion of [
      "cambiar_nivel",
      "editar_contenido",
      "actualizar_config",
      "activar_cuenta_cobro",
    ]) {
      expect(() =>
        describirAccion(
          fila({
            accion,
            entidad: "x",
            valorAnterior: [1, 2],
            valorNuevo: "raro",
          }),
          ctx,
        ),
      ).not.toThrow();
    }
  });
});
