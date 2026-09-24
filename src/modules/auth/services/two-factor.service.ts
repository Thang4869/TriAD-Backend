import speakeasy from "speakeasy";
import { BadRequestError } from "@shared/utils/errors";
import { UnauthorizedError } from "@shared/utils/errors";
import redis from "@core/redis/client";
import { IAuthRepository } from "../auth.repository";
import { TokenService } from "./token.service";
import { AuthUserResponse } from "../auth.mapper";
import config from "@config";

export class TwoFactorService {
  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  async enable2FA(
    userId: string,
  ): Promise<{ otpauthUrl: string; secret: string }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new BadRequestError("User not found");
    }

    const issuer = config.TOTP_ISSUER;
    const secret = speakeasy.generateSecret({
      name: `${issuer}:${user.email}`,
      issuer,
    });

    await this.authRepository.updateUser(userId, {
      totpSecret: secret.base32,
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
      throw new BadRequestError("2FA not set up");
    }

    if (!this.verifyTotpToken(user.totpSecret, token)) {
      throw new BadRequestError("Invalid TOTP token");
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
      throw new UnauthorizedError("2FA is not enabled");
    }

    if (!this.verifyTotpToken(user.totpSecret, token)) {
      throw new UnauthorizedError("Invalid TOTP token");
    }

    const timestep = Math.floor(Date.now() / 30_000);
    const replayKey = `auth:2fa:totp:${userId}:${timestep}`;
    const accepted = await redis.set(replayKey, "1", "EX", 90, "NX");
    if (accepted !== "OK") {
      throw new UnauthorizedError("TOTP token already used");
    }

    return this.tokenService.generateTokens(user);
  }

  private verifyTotpToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1,
    });
  }
}
