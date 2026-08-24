import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import prisma from "@core/database/prisma";
import redis from "@core/redis/client";
import { logger } from "@core/logger/winston";
import { emailQueue } from "@core/queue/bull";
import { BadRequestError, UnauthorizedError } from "@shared/utils/errors";

export class AuthService {
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

  private static readonly ACCESS_EXPIRY =
    process.env.JWT_ACCESS_EXPIRY || "15m";
  private static readonly REFRESH_EXPIRY =
    process.env.JWT_REFRESH_EXPIRY || "7d";

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new BadRequestError("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        isVerified: false,
      },
    });

    await prisma.cart.create({
      data: { userId: user.id },
    });

    await emailQueue.add("welcome", {
      to: user.email,
      subject: "Welcome to TriAD!",
      template: "welcome",
      data: { name: user.firstName },
    });

    return this.generateTokens(user);
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const isValid = await bcrypt.compare(password, user.password || "");
    if (!isValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    if (!user.isVerified) {
      throw new UnauthorizedError("Please verify your email");
    }

    if (user.is2FAEnabled) {
      return {
        requires2FA: true,
        userId: user.id,
        message: "2FA required",
      };
    }

    return this.generateTokens(user);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, AuthService.REFRESH_SECRET) as {
        sub: string;
      };

      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        throw new UnauthorizedError("Invalid refresh token");
      }

      const user = tokenRecord.user;

      await prisma.refreshToken.delete({
        where: { id: tokenRecord.id },
      });

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedError("Invalid refresh token");
    }
  }

  async logout(userId: string, accessToken?: string, refreshToken?: string) {
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken) as { exp: number };
        if (decoded && decoded.exp) {
          const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
          await redis.setex(`jwt:blacklist:${accessToken}`, ttl, "1");
        }
      } catch {}
    }

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    } else {
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
  }

  async enable2FA(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestError("User not found");
    }

    const secret = speakeasy.generateSecret({
      name: `${process.env.TOTP_ISSUER || "TriAD"}:${user.email}`,
      issuer: process.env.TOTP_ISSUER || "TriAD",
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: secret.base32,
        is2FAEnabled: false,
      },
    });

    return {
      otpauthUrl: secret.otpauth_url,
      secret: secret.base32,
    };
  }

  async verify2FA(userId: string, token: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.totpSecret) {
      throw new BadRequestError("2FA not set up");
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      throw new BadRequestError("Invalid TOTP token");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { is2FAEnabled: true },
    });

    return { enabled: true };
  }

  async verifyTOTP(userId: string, token: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.totpSecret || !user.is2FAEnabled) {
      throw new BadRequestError("2FA not enabled");
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) {
      throw new BadRequestError("Invalid TOTP token");
    }

    return this.generateTokens(user);
  }

  public async generateTokens(user: any) {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      Buffer.from(AuthService.ACCESS_SECRET, "utf-8"),
      { expiresIn: AuthService.ACCESS_EXPIRY } as jwt.SignOptions,
    );

    const refreshToken = jwt.sign(
      { sub: user.id },
      Buffer.from(AuthService.REFRESH_SECRET, "utf-8"),
      { expiresIn: AuthService.REFRESH_EXPIRY } as jwt.SignOptions,
    );

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        is2FAEnabled: user.is2FAEnabled || false,
      },
    };
  }
}
