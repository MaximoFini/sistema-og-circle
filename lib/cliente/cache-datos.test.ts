import { afterEach, describe, expect, it, vi } from "vitest";
import { escribirDatos, FRESCURA_MS, limpiarCacheDatos, precargar } from "./cache-datos";

// El hook (`useDatosCacheados`) es una capa fina sobre esto; Vitest corre en Node sin DOM,
// así que se prueba el núcleo: cuándo pide, cuándo reusa y cuándo se vacía.

let n = 0;
const clave = () => `test-${++n}`;

afterEach(() => {
  vi.useRealTimers();
  limpiarCacheDatos();
});

describe("precargar", () => {
  it("pide una sola vez mientras los datos están frescos", async () => {
    const k = clave();
    const cargar = vi.fn(async () => ({ a: 1 }));
    await precargar(k, cargar);
    await precargar(k, cargar);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it("dos pedidos simultáneos comparten el mismo viaje", async () => {
    const k = clave();
    const cargar = vi.fn(async () => 1);
    await Promise.all([precargar(k, cargar), precargar(k, cargar)]);
    expect(cargar).toHaveBeenCalledTimes(1);
  });

  it("vuelve a pedir cuando vence la frescura", async () => {
    vi.useFakeTimers();
    const k = clave();
    const cargar = vi.fn(async () => 1);
    await precargar(k, cargar);
    vi.advanceTimersByTime(FRESCURA_MS + 1);
    await precargar(k, cargar);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it("un error no deja datos y permite reintentar", async () => {
    const k = clave();
    const cargar = vi.fn().mockRejectedValueOnce(new Error("red")).mockResolvedValueOnce(2);
    await precargar(k, cargar);
    await precargar(k, cargar);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it("después de escribirDatos no pide (los datos escritos cuentan como frescos)", async () => {
    const k = clave();
    escribirDatos(k, () => ["x"]);
    const cargar = vi.fn(async () => ["y"]);
    await precargar(k, cargar);
    expect(cargar).not.toHaveBeenCalled();
  });
});

describe("limpiarCacheDatos", () => {
  it("obliga a pedir de nuevo", async () => {
    const k = clave();
    const cargar = vi.fn(async () => 1);
    await precargar(k, cargar);
    limpiarCacheDatos();
    await precargar(k, cargar);
    expect(cargar).toHaveBeenCalledTimes(2);
  });

  it("descarta una respuesta que llega después de limpiar (cambio de cuenta)", async () => {
    const k = clave();
    let soltar: (v: string) => void = () => {};
    const viejo = precargar(k, () => new Promise<string>((r) => (soltar = r)));
    limpiarCacheDatos();
    soltar("de la cuenta anterior");
    await viejo;

    const cargar = vi.fn(async () => "de la cuenta nueva");
    await precargar(k, cargar);
    expect(cargar).toHaveBeenCalledTimes(1);
  });
});
