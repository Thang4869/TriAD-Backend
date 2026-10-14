import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import prisma from "@core/database/prisma";
import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import { PrismaOutboxRelayStore } from "@core/outbox/prisma-outbox-relay.store";
import { PrismaOutboxHandlerTracker } from "@core/outbox/outbox-handler-tracker";
import { OutboxRelay } from "@core/outbox/outbox-relay";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { RegistrationVerificationHandler } from "@modules/auth/event-handlers/registration-verification.handler";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import type { EmailService } from "@shared/services/email.service";
import type { ClaimedOutboxEvent } from "@core/outbox/outbox-relay-store.port";

class ScopedStore extends PrismaOutboxRelayStore {
  constructor(private readonly eventId: string) { super(); }
  override async claimBatch(
    owner: string, _limit: number, maxAttempts: number, leaseSeconds: number,
  ): Promise<ClaimedOutboxEvent[]> {
    const now = new Date();
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: this.eventId, publishedAt: null, deadLetteredAt: null,
        attempts: { lt: maxAttempts },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { lockOwner: owner, lockedAt: now,
        leaseUntil: new Date(now.getTime() + leaseSeconds * 1000) },
    });
    if (claimed.count !== 1) return [];
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: this.eventId } });
    return [{ id: row.id, eventName: row.eventName, aggregateId: row.aggregateId,
      payload: row.payload, attempts: row.attempts, occurredAt: row.occurredAt }];
  }
}

describe("A1/T6 real process crash (PostgreSQL)", () => {
  it("recovers a UserRegistered event after SIGKILL during handler execution", async () => {
    const repository = new PrismaAuthRepository();
    const user = await repository.createUser({
      email: "kill-" + randomUUID() + "@test.com", password: "hash",
      firstName: "Crash", lastName: "Recovery",
    });
    const row = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: user.id, eventName: "UserRegistered" },
    });
    // Vitest may initialize Prisma before a worker-scoped DATABASE_URL is set.
    // Use the actual schema on the parent's Prisma connection for the child.
    const schemas = await prisma.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    databaseUrl.searchParams.set("schema", schemas[0].schema);
    const child = spawn(process.execPath, [
      "-r", "ts-node/register", "-r", "tsconfig-paths/register",
      resolve("scripts/test-support/registration-relay-crash-child.ts"), row.id,
    ], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl.toString(), TS_NODE_BASEURL: "./" } });
    try {
      let output = "";
      const started = new Promise<void>((accept, reject) => {
        let stderr = "";
        const timer = setTimeout(() => reject(new Error("Child timed out: " + stderr)), 20000);
        child.stdout?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("A1_HANDLER_STARTED")) { clearTimeout(timer); accept(); }
        });
        child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        child.once("exit", (code) => { clearTimeout(timer); reject(new Error("Child failed: " + code + " stdout=" + output + " stderr=" + stderr)); });
      });
      await started;
      const before = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
      expect(before.lockOwner).toMatch(/^killed-/);
      expect(before.publishedAt).toBeNull();
      const exited = once(child, "exit");
      expect(child.kill("SIGKILL")).toBe(true);
      await exited;
      expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } })).publishedAt).toBeNull();
      // The OS-level kill is real; only the elapsed lease interval is simulated.
      await prisma.outboxEvent.update({
        where: { id: row.id }, data: { leaseUntil: new Date(Date.now() - 1000) },
      });
      const tokenStore = { set: vi.fn().mockResolvedValue(undefined) } as unknown as TokenStorePort;
      const emailService = {
        sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      } as unknown as EmailService;
      const handler = new RegistrationVerificationHandler(repository, tokenStore, emailService);
      const bus = new EventBus();
      bus.subscribe("UserRegistered", "RegistrationVerificationHandler", handler.handle.bind(handler));
      await new OutboxRelay(new ScopedStore(row.id), new PrismaOutboxHandlerTracker(), bus, {
        owner: "replacement-" + randomUUID(), leaseDurationSeconds: 30,
      }).pollOnce();
      expect(await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } }))
        .toMatchObject({ publishedAt: expect.any(Date), lockOwner: null, attempts: 0 });
      expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      expect(await prisma.outboxHandlerLog.findUnique({
        where: { outboxEventId_handlerName: {
          outboxEventId: row.id, handlerName: "RegistrationVerificationHandler",
        } },
      })).toMatchObject({ status: "SUCCESS" });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 30000);
});
