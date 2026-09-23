import prisma from "@core/database/prisma";

async function main(): Promise<void> {
  const event = await prisma.outboxEvent.create({
    data: {
      eventName: "ChaosProbe",
      aggregateId: "chaos-probe",
      payload: { injectedFailure: true },
      occurredAt: new Date(),
    },
  });
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: { attempts: { increment: 1 }, lastError: "chaos-injected" },
  });
  const probe = await prisma.outboxEvent.findUnique({
    where: { id: event.id },
  });
  if (probe?.attempts !== 1 || probe.lastError !== "chaos-injected") {
    throw new Error("Outbox chaos probe did not preserve retry state");
  }
  await prisma.outboxEvent.delete({ where: { id: event.id } });
  await prisma.$disconnect();
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exitCode = 1;
});
