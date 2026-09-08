import crypto from "crypto";
import redis from "@core/redis/client";
import { logger } from "@core/logger/winston";
import { User as PrismaUser } from "@prisma/client";
import { BadRequestError, UnauthorizedError } from "@shared/utils/errors";
import { hashPassword, comparePassword } from "@shared/utils/bcrypt";
import { IAuthRepository, CreateUserData } from "./auth.repository";
import { EmailService } from "@shared/services/email.service";
import { TokenService } from "./services/token.service";
import { TwoFactorService } from "./services/two-factor.service";
import {
  AuthUserResponse,
  toAuthUserResponse,
  toEntityData,
} from "./auth.mapper";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import config from "@config";
import { User as UserEntity } from "../users/domain/user.entity";

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
    private readonly repository: IAuthRepository,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async generateTokens(user: PrismaUser) {
    return this.tokenService.generateTokens(user);
  }

  async register(data: CreateUserData) {
    const existing = await this.repository.findUserByEmail(data.email);
    if (existing) throw new BadRequestError("Email already registered");

    const hashedPassword = await hashPassword(data.password);
    const createdUser = await this.repository.createUser({
      ...data,
      password: hashedPassword,
    });

    const user = UserEntity.registered(toEntityData(createdUser));
    await this.publishEvents(user);
    await this.repository.createCartForUser(user.id);
    await this.sendVerificationEmail(createdUser);

    return {
      user: toAuthUserResponse(createdUser),
      message:
        "Registered successfully. Please check your email to verify your account.",
    };
  }

  async verifyEmail(token: string) {
    const userId = await redis.get(`email-verify:${token}`);
    if (!userId)
      throw new BadRequestError("Verification link is invalid or has expired");

    const foundUser = await this.repository.findUserById(userId);
    if (!foundUser) throw new BadRequestError("User not found");

    await redis.del(`email-verify:${token}`);

    if (foundUser.isVerified) {
      return this.tokenService.generateTokens(foundUser);
    }

    const user = UserEntity.hydrate(toEntityData(foundUser));
    user.verify();
    await this.publishEvents(user);

    const updatedUser = await this.repository.updateUser(user.id, {
      isVerified: true,
    });
    return this.tokenService.generateTokens(updatedUser);
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

  async login(email: string, password: string) {
    const user = await this.repository.findUserByEmail(email);
    if (!user) throw new UnauthorizedError("Invalid credentials");

    const isValid = await comparePassword(password, user.password || "");
    if (!isValid) throw new UnauthorizedError("Invalid credentials");

    if (!user.isVerified)
      throw new UnauthorizedError("Please verify your email");

    if (user.is2FAEnabled) {
      return { requires2FA: true, userId: user.id, message: "2FA required" };
    }

    return this.tokenService.generateTokens(user);
  }

  async logout(userId: string, accessToken?: string, refreshToken?: string) {
    if (accessToken) await this.tokenService.blacklistAccessToken(accessToken);
    if (refreshToken) {
      await this.repository.deleteRefreshTokenByToken(refreshToken);
    } else {
      await this.tokenService.invalidateAllUserTokens(userId);
    }
  }

  async enable2FA(userId: string) {
    return this.twoFactorService.enable2FA(userId);
  }

  async verify2FA(userId: string, token: string) {
    return this.twoFactorService.verify2FA(userId, token);
  }

  async verifyTOTP(userId: string, token: string) {
    return this.twoFactorService.verifyTOTP(userId, token);
  }

  async refreshToken(refreshToken: string) {
    return this.tokenService.refreshToken(refreshToken);
  }

  private async sendVerificationEmail(user: PrismaUser) {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    await redis.setex(`email-verify:${verificationToken}`, 15 * 60, user.id);
    const verifyUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await this.emailService.sendVerificationEmail(
      { email: user.email, firstName: user.firstName },
      verifyUrl,
    );
  }

  private async publishEvents(user: UserEntity) {
    const events = user.pullEvents();
    for (const event of events) {
      try {
        await EventBus.getInstance().publish(event);
      } catch (error) {
        logger.error(`Failed to publish ${event.eventName}`, { error });
      }
    }
  }
}
