import crypto from "crypto";
import speakeasy from "speakeasy";
import config from "@config";
import redis from "@core/redis/client";

import { User } from "@prisma/client";

import { logger } from "@core/logger/winston";
import { emailQueue } from "@core/queue/bull";

import { toAuthUserResponse, AuthUserResponse } from "./auth.mapper";
import {
  IAuthRepository,
  PrismaAuthRepository,
  CreateUserData,
} from "./auth.repository";

import { SECURITY } from "@shared/constants/security.constant";
import { BadRequestError, UnauthorizedError } from "@shared/utils/errors";
import { signToken, verifyToken } from "@shared/utils/jwt";
import { hashPassword, comparePassword } from "@shared/utils/bcrypt";

import { decodeToken as jwtDecode } from "@shared/utils/jwt";

const EMAIL_VERIFY_PREFIX = "email-verify:";
const EMAIL_VERIFY_TTL_SECONDS = 15 * 60;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUserResponse;
}

export interface TwoFactorRequired {
  requires2FA: true;
  userId: string;
  message: string;
}

export class AuthService {
  constructor(
    private readonly repository: IAuthRepository = new PrismaAuthRepository(),
  ) {}

  private static get ACCESS_SECRET(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("JWT_ACCESS_SECRET is not defined");
    return secret;
  }

  private static get REFRESH_SECRET(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error("JWT_REFRESH_SECRET is not defined");
    return secret;
  }

  private static get ACCESS_EXPIRY(): string {
    return process.env.JWT_ACCESS_EXPIRY || "15m";
  }
  private static get REFRESH_EXPIRY(): string {
    return process.env.JWT_REFRESH_EXPIRY || "7d";
  }

  async register(data: CreateUserData) {
    const existing = await this.repository.findUserByEmail(data.email);
    if (existing) {
      throw new BadRequestError("Email already registered");
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await this.repository.createUser({
      ...data,
      password: hashedPassword,
    });

    await this.repository.createCartForUser(user.id);
    await this.sendVerificationEmail(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      message:
        "Registered successfully. Please check your email to verify your account.",
    };
  }

  async verifyEmail(token: string): Promise<AuthTokens> {
    const userId = await redis.get(`${EMAIL_VERIFY_PREFIX}${token}`);
    if (!userId) {
      throw new BadRequestError("Verification link is invalid or has expired");
    }

    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new BadRequestError("User not found");
    }

    await redis.del(`${EMAIL_VERIFY_PREFIX}${token}`);

    if (user.isVerified) {
      return this.generateTokens(user);
    }

    const updatedUser = await this.repository.updateUser(user.id, {
      isVerified: true,
    });

    return this.generateTokens(updatedUser);
  }

  async resendVerificationEmail(email: string) {
    const user = await this.repository.findUserByEmail(email);

    if (user && !user.isVerified) {
      await this.sendVerificationEmail(user);
    }

    return {
      message:
        "If that account exists and is not verified yet, a new verification email has been sent.",
    };
  }

  async login(
    email: string,
    password: string,
  ): Promise<AuthTokens | TwoFactorRequired> {
    const user = await this.repository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const isValid = await comparePassword(password, user.password || "");
    if (!isValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    if (!user.isVerified) {
      throw new UnauthorizedError("Please verify your email");
    }

    if (user.is2FAEnabled) {
      return { requires2FA: true, userId: user.id, message: "2FA required" };
    }

    return this.generateTokens(user);
  }

  async logout(userId: string, accessToken?: string, refreshToken?: string) {
    if (accessToken) {
      await this.blacklistAccessToken(accessToken);
    }

    if (refreshToken) {
      await this.repository.deleteRefreshTokenByToken(refreshToken);
    } else {
      await this.repository.deleteRefreshTokensByUserId(userId);
    }
    await this.invalidateAllUserTokens(userId);
  }

  async enable2FA(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new BadRequestError("User not found");
    }

    const issuer = process.env.TOTP_ISSUER || "TriAD";
    const secret = speakeasy.generateSecret({
      name: `${issuer}:${user.email}`,
      issuer,
    });

    await this.repository.updateUser(userId, {
      totpSecret: secret.base32,
      is2FAEnabled: false,
    });

    return {
      otpauthUrl: secret.otpauth_url,
      secret: secret.base32,
    };
  }

  async verify2FA(userId: string, token: string) {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.totpSecret) {
      throw new BadRequestError("2FA not set up");
    }

    if (!this.verifyTotpToken(user.totpSecret, token)) {
      throw new BadRequestError("Invalid TOTP token");
    }

    await this.repository.updateUser(userId, { is2FAEnabled: true });
    return { enabled: true };
  }

  async verifyTOTP(userId: string, token: string): Promise<AuthTokens> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.totpSecret || !user.is2FAEnabled) {
      throw new BadRequestError("2FA not enabled");
    }

    if (!this.verifyTotpToken(user.totpSecret, token)) {
      throw new BadRequestError("Invalid TOTP token");
    }

    return this.generateTokens(user);
  }

  public async generateTokens(user: User): Promise<AuthTokens> {
    const accessToken = signToken(
      { sub: user.id, email: user.email, role: user.role },
      AuthService.ACCESS_SECRET,
      AuthService.ACCESS_EXPIRY,
    );

    const refreshToken = signToken(
      { sub: user.id },
      AuthService.REFRESH_SECRET,
      AuthService.REFRESH_EXPIRY,
    );

    await this.repository.createRefreshToken(
      refreshToken,
      user.id,
      new Date(Date.now() + SECURITY.REFRESH_TOKEN_TTL_MS),
    );

    return { accessToken, refreshToken, user: toAuthUserResponse(user) };
  }

  async invalidateAllUserTokens(userId: string) {
    await this.repository.deleteRefreshTokensByUserId(userId);
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      verifyToken(refreshToken, AuthService.REFRESH_SECRET);

      const tokenRecord =
        await this.repository.findRefreshTokenWithUser(refreshToken);

      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedError("Invalid refresh token");
      }

      const user = tokenRecord.user;
      await this.repository.deleteRefreshTokenById(tokenRecord.id);
      await this.invalidateAllUserTokens(user.id);

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedError("Invalid refresh token");
    }
  }

  // ---------- Private helpers ----------

  private async sendVerificationEmail(user: User): Promise<void> {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    await redis.setex(
      `${EMAIL_VERIFY_PREFIX}${verificationToken}`,
      EMAIL_VERIFY_TTL_SECONDS,
      user.id,
    );

    const verifyUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await emailQueue.add("verify-email", {
      to: user.email,
      subject: "Xác thực tài khoản TriAD của bạn",
      template: "verify-email",
      data: { name: user.firstName, verifyUrl },
    });
  }

  private async blacklistAccessToken(accessToken: string): Promise<void> {
    try {
      const decoded = jwtDecode(accessToken) as { exp: number } | null;
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.setex(
            `${SECURITY.BLACKLIST_KEY_PREFIX}${accessToken}`,
            ttl,
            "1",
          );
        }
      }
    } catch (error) {
      logger.warn("Failed to decode access token during logout", { error });
    }
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
