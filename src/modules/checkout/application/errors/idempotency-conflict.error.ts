export class IdempotencyConflictError extends Error {
  constructor() {
    super("An order already exists for this idempotency key");
    this.name = "IdempotencyConflictError";
  }
}
