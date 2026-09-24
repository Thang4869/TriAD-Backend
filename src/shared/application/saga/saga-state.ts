export interface SagaStateStore<TState> {
  load(sagaId: string): Promise<TState | undefined>;
  save(sagaId: string, state: TState): Promise<void>;
}

export interface SagaStepPolicy {
  timeoutMs: number;
  maxAttempts: number;
  backoffMs: number;
}

export class SagaTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SagaTimeoutError";
  }
}

export async function executeSagaStep<T>(
  stepName: string,
  operation: () => Promise<T>,
  policy: SagaStepPolicy,
  deadlineAt: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new SagaTimeoutError(`Saga deadline exceeded before ${stepName}`);
    }
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new SagaTimeoutError(`${stepName} timed out`)),
            Math.min(policy.timeoutMs, remainingMs),
          ).unref(),
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === policy.maxAttempts) break;
      const delay = Math.min(
        policy.backoffMs * 2 ** (attempt - 1),
        Math.max(0, deadlineAt - Date.now()),
      );
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Saga step ${stepName} failed`);
}

export class InMemorySagaStateStore<TState> implements SagaStateStore<TState> {
  private readonly states = new Map<string, TState>();

  async load(sagaId: string): Promise<TState | undefined> {
    return this.states.get(sagaId);
  }

  async save(sagaId: string, state: TState): Promise<void> {
    this.states.set(sagaId, state);
  }
}
