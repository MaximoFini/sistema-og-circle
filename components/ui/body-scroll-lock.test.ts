import { beforeEach, describe, expect, it } from "vitest";
import { _reiniciarBloqueosParaTests, bloquearScroll } from "./body-scroll-lock";

function cuerpo(overflow = "") {
  return { style: { overflow } };
}

describe("bloquearScroll (contador)", () => {
  beforeEach(() => _reiniciarBloqueosParaTests());

  it("bloquea al primer uso y restaura el valor original al liberar", () => {
    const body = cuerpo("auto");
    const liberar = bloquearScroll(body);
    expect(body.style.overflow).toBe("hidden");

    liberar();
    expect(body.style.overflow).toBe("auto");
  });

  it("dos bloqueos solapados cerrados en el MISMO orden en que se abrieron: queda libre", () => {
    // Es el caso que rompe el patrón "guardar y restaurar": A abre, B abre (guarda
    // "hidden"), A cierra (restaura ""), B cierra (restaura "hidden") => trabado.
    const body = cuerpo("");
    const liberarA = bloquearScroll(body);
    const liberarB = bloquearScroll(body);

    liberarA();
    expect(body.style.overflow).toBe("hidden"); // B sigue abierto

    liberarB();
    expect(body.style.overflow).toBe("");
  });

  it("dos bloqueos solapados cerrados en el orden inverso: también queda libre", () => {
    const body = cuerpo("");
    const liberarA = bloquearScroll(body);
    const liberarB = bloquearScroll(body);

    liberarB();
    expect(body.style.overflow).toBe("hidden");

    liberarA();
    expect(body.style.overflow).toBe("");
  });

  it("liberar dos veces la misma llamada no descuenta de más", () => {
    const body = cuerpo("");
    const liberarA = bloquearScroll(body);
    const liberarB = bloquearScroll(body);

    liberarA();
    liberarA(); // idempotente: no debe liberar el bloqueo de B
    expect(body.style.overflow).toBe("hidden");

    liberarB();
    expect(body.style.overflow).toBe("");
  });
});
