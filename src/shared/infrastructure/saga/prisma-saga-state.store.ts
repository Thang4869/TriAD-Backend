import { Prisma } from "@prisma/client";
import prisma from "@core/database/prisma";
import { SagaStateStore } from "@shared/application/saga/saga-state";

type SagaStateWithStep = {
  step?: string;
};

export class PrismaSagaStateStore<
  TState extends SagaStateWithStep,
> implements SagaStateStore<TState> {
  constructor(private readonly sagaType: string) {}

  async load(sagaId: string): Promise<TState | undefined> {
    const record = await prisma.sagaState.findUnique({
      where: { id: sagaId },
    });

    if (!record || record.sagaType !== this.sagaType) {
      return undefined;
    }

    return record.state as unknown as TState;
  }

  async save(sagaId: string, state: TState): Promise<void> {
    const completedAt =
      state.step === "COMPLETED" || state.step === "COMPENSATED"
        ? new Date()
        : null;

    await prisma.sagaState.upsert({
      where: { id: sagaId },
      create: {
        id: sagaId,
        sagaType: this.sagaType,
        state: state as unknown as Prisma.InputJsonValue,
        completedAt,
      },
      update: {
        state: state as unknown as Prisma.InputJsonValue,
        completedAt,
        version: { increment: 1 },
      },
    });
  }
}
