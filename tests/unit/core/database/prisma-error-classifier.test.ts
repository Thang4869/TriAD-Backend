import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  describePrismaError,
  isPrismaSerializationConflict,
  PrismaErrorClassifier,
} from "@core/database/prisma-error-classifier";

describe("PrismaErrorClassifier", () => {
  const classifier = new PrismaErrorClassifier();

  it("classifies P2002 as UNIQUE_CONSTRAINT", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    expect(classifier.classify(error)).toEqual({ kind: "UNIQUE_CONSTRAINT" });
  });

  it("classifies P2025 as NOT_FOUND", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(classifier.classify(error)).toEqual({ kind: "NOT_FOUND" });
  });

  it("classifies P2034 as TRANSACTION_CONFLICT", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Transaction conflict",
      {
        code: "P2034",
        clientVersion: "test",
      },
    );
    expect(classifier.classify(error)).toEqual({
      kind: "TRANSACTION_CONFLICT",
    });
  });

  it("classifies raw-query SQLSTATE 40001 as TRANSACTION_CONFLICT without instanceof", () => {
    expect(
      classifier.classify({
        name: "PrismaClientKnownRequestError",
        code: "P2010",
        meta: {
          code: "40001",
          message: "could not serialize access due to concurrent update",
        },
      }),
    ).toEqual({ kind: "TRANSACTION_CONFLICT" });
  });

  it("keeps other P2010 SQLSTATE values as DATABASE", () => {
    expect(
      classifier.classify({
        name: "PrismaClientKnownRequestError",
        code: "P2010",
        meta: { code: "42P01" },
      }),
    ).toEqual({ kind: "DATABASE" });
  });

  it("classifies other known Prisma errors as DATABASE", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed",
      {
        code: "P2003",
        clientVersion: "test",
      },
    );
    expect(classifier.classify(error)).toEqual({ kind: "DATABASE" });
  });

  it("classifies PrismaClientValidationError as VALIDATION", () => {
    const error = new Prisma.PrismaClientValidationError("Invalid data", {
      clientVersion: "test",
    });
    expect(classifier.classify(error)).toEqual({ kind: "VALIDATION" });
  });

  it("returns null for non-Prisma errors", () => {
    expect(classifier.classify(new Error("Regular error"))).toBeNull();
  });

  it("describes non-object errors as unknown", () => {
    expect(describePrismaError(null)).toEqual({
      category: "unknown",
      code: "unknown",
      model: "unknown",
    });
  });

  it("describes structural Prisma errors with model metadata", () => {
    expect(
      describePrismaError({
        code: "P2002",
        meta: { modelName: "User" },
      }),
    ).toEqual({
      category: "database_error",
      code: "P2002",
      model: "User",
    });
  });

  it("uses unknown labels for non-string code and model metadata", () => {
    expect(
      describePrismaError({
        code: 2002,
        meta: { modelName: 42 },
      }),
    ).toEqual({
      category: "unknown",
      code: "unknown",
      model: "unknown",
    });
  });

  it.each([
    [null, false],
    [{ code: "P2034" }, true],
    [{ code: "P2010", meta: { code: "40001" } }, true],
    [{ code: "P2010", meta: { code: "42P01" } }, false],
    [{ code: "P2010" }, false],
    [{ code: "P2002" }, false],
  ])("detects serialization conflicts for %j", (error, expected) => {
    expect(isPrismaSerializationConflict(error)).toBe(expected);
  });
});
