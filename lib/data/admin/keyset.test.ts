// VGRP-47 §2 — `escaparLike` es una función pura de escape de string (sin I/O,
// ver lib/data/admin/keyset.ts): no hace falta pegarle a Postgres para probar
// que escapa los comodines de LIKE/ILIKE correctamente. El ángulo "contra la
// base real" del ticket (crear usuarios con `%`/`_` en el email) queda cubierto
// aparte en `lib/data/admin/usuarios-busqueda.test.ts`, que sí verifica el
// comportamiento end-to-end de `listarUsuarios` con esos caracteres en el
// input de búsqueda.

import { describe, expect, it } from "vitest";
import { escaparLike } from "./keyset";

describe("escaparLike (VGRP-47 §2)", () => {
  it("escapa % para que no actúe como comodín de 'cualquier secuencia'", () => {
    expect(escaparLike("100%")).toBe("100\\%");
  });

  it("escapa _ para que no actúe como comodín de 'un solo caracter'", () => {
    expect(escaparLike("a_b")).toBe("a\\_b");
  });

  it("escapa \\ (el propio caracter de escape) antes que nada, para no romper el escape de % ni _", () => {
    // Un input con barra invertida literal tiene que escaparse a sí mismo, o
    // el backslash resultante del escape de % / _ quedaría ambiguo.
    expect(escaparLike("a\\b")).toBe("a\\\\b");
  });

  it("combina los tres en un solo input sin pisarse entre sí", () => {
    expect(escaparLike("100%_off\\now")).toBe("100\\%\\_off\\\\now");
  });

  it("un input sin comodines queda intacto", () => {
    expect(escaparLike("usuario@test.og-circle.invalid")).toBe("usuario@test.og-circle.invalid");
  });

  it("el resultado, usado en un patrón ILIKE envuelto en %...%, matchea SÓLO el literal — nunca de más", () => {
    // Simulación del patrón real que arma listarUsuarios: `%${escaparLike(q)}%`.
    // Si escaparLike no escapara "_", buscar "a_b" (input del admin) matchearía
    // también "axb", "ayb", etc. — de más. Acá se verifica la construcción del
    // patrón en sí, no una query real (ese ángulo queda para el test de
    // integración de listarUsuarios).
    const patron = `%${escaparLike("a_b")}%`;
    expect(patron).toBe("%a\\_b%");
    // Y un patrón armado con el input CRUDO (sin escapar) sería distinto —
    // confirma que escaparLike efectivamente cambia el patrón resultante.
    expect(patron).not.toBe(`%a_b%`);
  });
});
