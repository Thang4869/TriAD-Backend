import prisma from "@core/database/prisma";
import { SagaStateStore } from "@shared/application/saga/saga-state";

export class PrismaSagaStateStore<TState> implements SagaStateStore<TState> {
  constructor(private readonly sagaType: string) {}

  async load(sagaId: string): Promise<TState | undefined> {
    const row = await prisma.sagaState.findUnique({
      where: { id: sagaId },
      select: { sagaType: true, state: true },
    });
    if (!row || row.sagaType !== this.sagaType) return undefined;
    return row.state as TState;
  }

  async save(sagaId: string, state: TState): Promise<void> {
    const completedAt =
      (state as { step?: string }).step === "COMPLETED" ? new Date() : null;
    await prisma.sagaState.upsert({
      where: { id: sagaId },
      create: {
        id: sagaId,
        sagaType: this.sagaType,
        state: state as object,
        completedAt,
      },
      update: {
        state: state as object,
        sagaType: this.sagaType,
        completedAt,
        version: { increment: 1 },
      },
    });
  }
}
