import { Prisma } from "@prisma/client";
import type {
  PersistenceErrorClassifier,
  PersistenceErrorInfo,
} from "@shared/errors/persistence-error";

export class PrismaErrorClassifier implements PersistenceErrorClassifier {
  classify(error: unknown): PersistenceErrorInfo | null {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case "P2002":
          return { kind: "UNIQUE_CONSTRAINT" };

        case "P2025":
          return { kind: "NOT_FOUND" };

        case "P2034":
          return { kind: "TRANSACTION_CONFLICT" };

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
