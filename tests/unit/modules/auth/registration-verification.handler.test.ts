import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserRegisteredEvent } from "@shared/domain/events/user-events";
import { RegistrationVerificationHandler } from "@modules/auth/event-handlers/registration-verification.handler";
import type { IAuthRepository } from "@modules/auth/application/ports/auth.repository.port";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";
import type { EmailService } from "@shared/services/email.service";

const user = {
  id: "user-1",
  email: "person@example.com",
  firstName: "Person",
  isVerified: false,
};

function createHandler() {
  const findUserById = vi.fn().mockResolvedValue(user);
  const set = vi.fn().mockResolvedValue(undefined);
  const sendVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const handler = new RegistrationVerificationHandler(
    { findUserById } as unknown as Pick<IAuthRepository, "findUserById">,
    { set } as unknown as TokenStorePort,
    { sendVerificationEmail } as unknown as EmailService,
  );
  return { handler, findUserById, set, sendVerificationEmail };
}

describe("RegistrationVerificationHandler (A1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives one stable token and queue job for a replayed registration event", async () => {
    const { handler, set, sendVerificationEmail } = createHandler();
    const event = new UserRegisteredEvent(user.id, user.email);
    await handler.handle(event);
    await handler.handle(event);

    expect(set).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(set).mock.calls[0][0];
    expect(firstKey).toMatch(/^email-verify:[a-f0-9]{64}$/);
    expect(firstKey).toEqual(vi.mocked(set).mock.calls[1][0]);
    expect(set).toHaveBeenCalledWith(firstKey, user.id, 900);
    const firstUrl = vi.mocked(sendVerificationEmail).mock.calls[0][1];
    expect(firstUrl).toEqual(vi.mocked(sendVerificationEmail).mock.calls[1][1]);
    expect(firstUrl).toContain(firstKey.replace("email-verify:", ""));
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      { email: user.email, firstName: user.firstName },
      firstUrl,
      "registration-verification-user-1",
    );
  });

  it("skips already verified users and deleted users without queue side effects", async () => {
    const { handler, findUserById, set, sendVerificationEmail } = createHandler();
    vi.mocked(findUserById).mockResolvedValueOnce({ ...user, isVerified: true } as never);
    vi.mocked(findUserById).mockResolvedValueOnce(null);
    const event = new UserRegisteredEvent(user.id, user.email);
    await handler.handle(event);
    await handler.handle(event);
    expect(set).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("propagates Redis failure before enqueue so relay can retry", async () => {
    const { handler, set, sendVerificationEmail } = createHandler();
    vi.mocked(set).mockRejectedValueOnce(new Error("redis down"));
    await expect(handler.handle(new UserRegisteredEvent(user.id, user.email))).rejects.toThrow("redis down");
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("propagates BullMQ failure, keeping a deterministic token for eventual retry", async () => {
    const { handler, set, sendVerificationEmail } = createHandler();
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(new Error("queue down"));
    const event = new UserRegisteredEvent(user.id, user.email);
    await expect(handler.handle(event)).rejects.toThrow("queue down");
    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(vi.mocked(set).mock.calls[0][0]).toBe(vi.mocked(set).mock.calls[1][0]);
    expect(vi.mocked(sendVerificationEmail).mock.calls[0][2]).toBe(
      vi.mocked(sendVerificationEmail).mock.calls[1][2],
    );
  });
});
