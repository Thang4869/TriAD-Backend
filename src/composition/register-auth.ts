import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import { RedisTokenStore } from "@modules/auth/infrastructure/token-store/redis-token-store";
import { RedisOAuthStateStore } from "@modules/auth/infrastructure/token-store/redis-oauth-state-store";

import { TokenService } from "@modules/auth/services/token.service";
import { TwoFactorService } from "@modules/auth/services/two-factor.service";
import { AuthService } from "@modules/auth/auth.service";
import { AuthController } from "@modules/auth/auth.controller";
import { registerOAuthStrategies } from "@modules/auth/strategies/oauth2.strategy";

export function registerAuthModule(container: Container): void {
  const authRepository = new PrismaAuthRepository();

  container.register(TOKENS.AuthRepository, () => authRepository);

  container.register(TOKENS.AuthSessionUser, () => authRepository);

  container.register(TOKENS.TokenStore, () => new RedisTokenStore());

  container.register(
    TOKENS.OAuthStateStore,
    (c) => new RedisOAuthStateStore(c.resolve(TOKENS.TokenStore)),
  );

  container.register(
    TOKENS.TokenService,
    (c) =>
      new TokenService(
        c.resolve(TOKENS.AuthRepository),
        c.resolve(TOKENS.TokenStore),
      ),
  );

  container.register(
    TOKENS.TwoFactorService,
    (c) =>
      new TwoFactorService(
        c.resolve(TOKENS.AuthRepository),
        c.resolve(TOKENS.TokenService),
        c.resolve(TOKENS.TokenStore),
      ),
  );

  container.register(
    TOKENS.AuthService,
    (c) =>
      new AuthService(
        c.resolve(TOKENS.AuthRepository),
        c.resolve(TOKENS.EmailService),
        c.resolve(TOKENS.TokenService),
        c.resolve(TOKENS.TwoFactorService),
        c.resolve(TOKENS.TokenStore),
        c.resolve(TOKENS.EventBus),
      ),
  );

  container.register(
    TOKENS.AuthController,
    (c) => new AuthController(c.resolve(TOKENS.AuthService)),
    Lifetime.Transient,
  );

  registerOAuthStrategies(
    container.resolve(TOKENS.AuthService),
    container.resolve(TOKENS.OAuthStateStore),
  );
}
