import speakeasy from "speakeasy";
import {
  ValidationError,
  AuthenticationError,
} from "@shared/errors/application-error";
import { TokenStorePort } from "../application/ports/token-store.port";
import type { IAuthRepository } from "../application/ports/auth.repository.port";
import { TokenService } from "./token.service";
import { AuthUserResponse } from "../auth.mapper";
import config from "@config";
import { decryptTotpSecret, encryptTotpSecret } from "./totp-secret.crypto";

export class TwoFactorService {
  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly tokenService: TokenService,
    private readonly tokenStore: TokenStorePort,
  ) {}

  async enable2FA(
    userId: string,
  ): Promise<{ otpauthUrl: string; secret: string }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new ValidationError("User not found");
    }

    const issuer = config.TOTP_ISSUER;
    const secret = speakeasy.generateSecret({
      name: `${issuer}:${user.email}`,
      issuer,
    });

    await this.authRepository.updateUser(userId, {
      totpSecret: encryptTotpSecret(secret.base32, config.TOTP_ENCRYPTION_KEY),
      is2FAEnabled: false,
    });

    return {
      otpauthUrl: secret.otpauth_url ?? "",
      secret: secret.base32,
    };
  }

  async verify2FA(
    userId: string,
    token: string,
  ): Promise<{ enabled: boolean }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user || !user.totpSecret) {
      throw new ValidationError("2FA not set up");
    }

    const totpSecret = decryptTotpSecret(
      user.totpSecret,
      config.TOTP_ENCRYPTION_KEY,
    );
    if (this.getTotpDelta(totpSecret, token) === null) {
      throw new ValidationError("Invalid TOTP token");
    }

    await this.authRepository.updateUser(userId, { is2FAEnabled: true });
    return { enabled: true };
  }

  async verifyTOTP(
    preAuthToken: string,
    token: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserResponse;
  }> {
    const userId =
      await this.tokenService.consumeTwoFactorPreAuthToken(preAuthToken);
    const user = await this.authRepository.findUserById(userId);
    if (!user || !user.totpSecret || !user.is2FAEnabled) {
      throw new AuthenticationError("2FA is not enabled");
    }

    const totpSecret = decryptTotpSecret(
      user.totpSecret,
      config.TOTP_ENCRYPTION_KEY,
    );
    const currentTime = Date.now() / 1000;
    const delta = this.getTotpDelta(totpSecret, token, currentTime);
    if (delta === null) {
      throw new AuthenticationError("Invalid TOTP token");
    }

    const matchedTimeStep = Math.floor(currentTime / 30) + delta;
    const replayKey = `auth:2fa:totp:${userId}:${matchedTimeStep}`;
    const accepted = await this.tokenStore.setIfAbsent(replayKey, "1", 90);

    if (!accepted) {
      throw new AuthenticationError("TOTP token already used");
    }

    return this.tokenService.generateTokens(user);
  }

  private getTotpDelta(
    secret: string,
    token: string,
    time = Date.now() / 1000,
  ): number | null {
    const verification = speakeasy.totp.verifyDelta({
      secret,
      encoding: "base32",
      token,
      time,
      window: 1,
    });

    return verification?.delta ?? null;
  }
}
