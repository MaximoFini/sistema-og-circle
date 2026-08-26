import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNotProductionDatabase, ProductionDatabaseGuardError } from "./production-guard";

describe("assertNotProductionDatabase", () => {
  const originalRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;

  afterEach(() => {
    if (originalRef === undefined) {
      delete process.env.PRODUCTION_SUPABASE_PROJECT_REF;
    } else {
      process.env.PRODUCTION_SUPABASE_PROJECT_REF = originalRef;
    }
  });

  describe("sin PRODUCTION_SUPABASE_PROJECT_REF configurado (estado actual del proyecto)", () => {
    beforeEach(() => {
      delete process.env.PRODUCTION_SUPABASE_PROJECT_REF;
    });

    it("no lanza para ninguna URL válida, sea cual sea el ref", () => {
      expect(() =>
        assertNotProductionDatabase("https://hsmodrhbwkromoixrxrt.supabase.co"),
      ).not.toThrow();
      expect(() =>
        assertNotProductionDatabase("https://abcdefghijklmnopqrst.supabase.co"),
      ).not.toThrow();
    });

    it("igual lanza si no se pasa ninguna URL", () => {
      expect(() => assertNotProductionDatabase(undefined)).toThrow(ProductionDatabaseGuardError);
      expect(() => assertNotProductionDatabase("")).toThrow(ProductionDatabaseGuardError);
    });
  });

  describe("con PRODUCTION_SUPABASE_PROJECT_REF configurado (cuando exista el proyecto separado)", () => {
    beforeEach(() => {
      process.env.PRODUCTION_SUPABASE_PROJECT_REF = "prodrefaaaaaaaaaaaa1";
    });

    it("no lanza con una URL de un proyecto distinto al de producción", () => {
      expect(() =>
        assertNotProductionDatabase("https://hsmodrhbwkromoixrxrt.supabase.co"),
      ).not.toThrow();
    });

    it("lanza si la URL es la del proyecto de producción configurado", () => {
      expect(() => assertNotProductionDatabase("https://prodrefaaaaaaaaaaaa1.supabase.co")).toThrow(
        ProductionDatabaseGuardError,
      );
    });

    it("lanza si la connection string de producción viene por el pooler", () => {
      expect(() =>
        assertNotProductionDatabase(
          "postgres://postgres.prodrefaaaaaaaaaaaa1:pw@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
        ),
      ).toThrow(ProductionDatabaseGuardError);
    });

    it("la comparación de ref no distingue mayúsculas/minúsculas", () => {
      expect(() => assertNotProductionDatabase("https://PRODREFAAAAAAAAAAAA1.supabase.co")).toThrow(
        ProductionDatabaseGuardError,
      );
    });

    it("lanza si no se pasa ninguna URL", () => {
      expect(() => assertNotProductionDatabase(undefined)).toThrow(ProductionDatabaseGuardError);
    });
  });
});
