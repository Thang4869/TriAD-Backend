import { createHmac } from "node:crypto";
import config from "@config";
import type { IAuthRepository } from "../application/ports/auth.repository.port";
import type { TokenStorePort } from "../application/ports/token-store.port";
import type { UserRegisteredEvent } from "@shared/domain/events/user-events";
import type { EmailService } from "@shared/services/email.service";

const VERIFY_EMAIL_TTL_SECONDS = 15 * 60;

/**
 * An unverified registration has a durable UserRegistered outbox event.
 * The handler must be retry-safe: deriving the same token and queue jobId from
 * that event prevents retries from minting different verification links.
 */
export class RegistrationVerificationHandler {
  constructor(
    private readonly repository: Pick<IAuthRepository, "findUserById">,
    private readonly tokenStore: TokenStorePort,
    private readonly emailService: EmailService,
  ) {}

  async handle(event: UserRegisteredEvent): Promise<void> {
    const user = await this.repository.findUserById(event.aggregateId);
    if (!user || user.isVerified) return;

    const token = createHmac("sha256", config.JWT_PREAUTH_SECRET)
      .update(`registration-verification:v1:${event.aggregateId}:${event.occurredAt.toISOString()}`)
      .digest("hex");

    // Persist before enqueueing. Redis failure must propagate to outbox retry.
    await this.tokenStore.set(
      `email-verify:${token}`,
      user.id,
      VERIFY_EMAIL_TTL_SECONDS,
    );

    const verifyUrl = `${config.FRONTEND_URL}/verify-email?token=${token}`;
    await this.emailService.sendVerificationEmail(
      { email: user.email, firstName: user.firstName },
      verifyUrl,
      `registration-verification-${user.id}`,
    );
  }
}
