export type PersistenceErrorKind =
  | "UNIQUE_CONSTRAINT"
  | "NOT_FOUND"
  | "TRANSACTION_CONFLICT"
  | "DATABASE"
  | "VALIDATION";

export interface PersistenceErrorInfo {
  kind: PersistenceErrorKind;
}

export interface PersistenceErrorClassifier {
  classify(error: unknown): PersistenceErrorInfo | null;
}
