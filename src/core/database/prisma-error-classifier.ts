import { Prisma } from "@prisma/client";
import type {
  PersistenceErrorClassifier,
  PersistenceErrorInfo,
} from "@shared/errors/persistence-error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isPrismaKnownRequestError(
  error: unknown,
): error is Record<string, unknown> & { code: string } {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    (isRecord(error) &&
      typeof error.code === "string" &&
      /^P\d{4}$/.test(error.code))
  );
}

export function isPrismaSerializationConflict(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  if (error.code === "P2034") {
    return true;
  }

  return (
    error.code === "P2010" &&
    isRecord(error.meta) &&
    String(error.meta.code) === "40001"
  );
}

export class PrismaErrorClassifier implements PersistenceErrorClassifier {
  classify(error: unknown): PersistenceErrorInfo | null {
    if (isPrismaKnownRequestError(error)) {
      if (isPrismaSerializationConflict(error)) {
        return { kind: "TRANSACTION_CONFLICT" };
      }

      switch (error.code) {
        case "P2002":
          return { kind: "UNIQUE_CONSTRAINT" };

        case "P2025":
          return { kind: "NOT_FOUND" };

        default:
          return { kind: "DATABASE" };
      }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      return { kind: "VALIDATION" };
    }

    return null;
  }
}
