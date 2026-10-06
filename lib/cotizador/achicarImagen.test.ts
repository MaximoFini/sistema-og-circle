import { describe, expect, it } from "vitest";
import { dimensionesAchicadas, LADO_MAXIMO } from "./achicarImagen";

// El canvas no existe en el entorno de test: la parte que dibuja la cubren el
// E2E y el QA manual. Acá, la cuenta de dimensiones.
describe("dimensionesAchicadas", () => {
  it("una foto vertical de celular (3024×4032) baja a 1200×1600", () => {
    expect(dimensionesAchicadas(3024, 4032)).toEqual({ ancho: 1200, alto: 1600 });
  });

  it("una horizontal (4032×3024) baja a 1600×1200", () => {
    expect(dimensionesAchicadas(4032, 3024)).toEqual({ ancho: 1600, alto: 1200 });
  });

  it("nunca agranda una imagen chica", () => {
    expect(dimensionesAchicadas(800, 600)).toEqual({ ancho: 800, alto: 600 });
    expect(dimensionesAchicadas(LADO_MAXIMO, 10)).toEqual({ ancho: LADO_MAXIMO, alto: 10 });
  });

  it("respeta un máximo distinto y nunca devuelve 0", () => {
    expect(dimensionesAchicadas(10000, 2, 1200)).toEqual({ ancho: 1200, alto: 1 });
  });
});
