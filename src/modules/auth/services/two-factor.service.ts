import speakeasy from "speakeasy";
import { BadRequestError } from "@shared/utils/errors";
import { IAuthRepository } from "../auth.repository";
import { TokenService } from "./token.service";
import { AuthUserResponse } from "../auth.mapper";

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

    const issuer = process.env.TOTP_ISSUER || "TriAD";
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
    userId: string,
    token: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserResponse;
  }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user || !user.totpSecret || !user.is2FAEnabled) {
      throw new BadRequestError("2FA not enabled");
    }

    if (!this.verifyTotpToken(user.totpSecret, token)) {
      throw new BadRequestError("Invalid TOTP token");
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
