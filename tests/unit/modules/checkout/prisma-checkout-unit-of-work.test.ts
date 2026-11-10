import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { PrismaErrorClassifier } from "@core/database/prisma-error-classifier";

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

    expect(classifier.classify(error)).toEqual({
      kind: "UNIQUE_CONSTRAINT",
    });
  });

  it("classifies P2025 as NOT_FOUND", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    });

    expect(classifier.classify(error)).toEqual({
      kind: "NOT_FOUND",
    });
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

  it("classifies other known Prisma errors as DATABASE", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed",
      {
        code: "P2003",
        clientVersion: "test",
      },
    );

    expect(classifier.classify(error)).toEqual({
      kind: "DATABASE",
    });
  });

  it("classifies PrismaClientValidationError as VALIDATION", () => {
    const error = new Prisma.PrismaClientValidationError("Invalid data", {
      clientVersion: "test",
    });

    expect(classifier.classify(error)).toEqual({
      kind: "VALIDATION",
    });
  });

  it("returns null for non-Prisma errors", () => {
    expect(classifier.classify(new Error("Regular error"))).toBeNull();
  });
});
