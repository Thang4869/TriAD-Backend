export interface SagaStateStore<TState> {
  load(sagaId: string): Promise<TState | undefined>;
  save(sagaId: string, state: TState): Promise<void>;
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
