import { describe, expect, it } from "vitest";
import { TokenService } from "@modules/auth/services/token.service";
import { PrismaAuthRepository } from "@modules/auth/infrastructure/repositories/prisma-auth.repository";
import type { TokenStorePort } from "@modules/auth/application/ports/token-store.port";

function createTokenStore(): TokenStorePort {
  return {
    get: async () => null,
    set: async () => undefined,
    delete: async () => undefined,
    getAndDelete: async () => null,
    setIfAbsent: async () => true,
  };
}

describe("Refresh token rotation race (integration)", () => {
  it("allows only one concurrent refresh request to rotate the same token", async () => {
    const repository = new PrismaAuthRepository();
    const service = new TokenService(repository, createTokenStore());

    const suffix = `${Date.now()}-${Math.random()}`;

    const user = await repository.createUser({
      email: `refresh-race-${suffix}@test.com`,
      password: "hashed",
      firstName: "Refresh",
      lastName: "Race",
    });

    const issued = await service.generateTokens(user);

    const results = await Promise.allSettled([
      service.refreshToken(issued.refreshToken),
      service.refreshToken(issued.refreshToken),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");

    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const succeeded =
      fulfilled[0].status === "fulfilled" ? fulfilled[0].value : null;

    expect(succeeded).not.toBeNull();

    const activeTokens = await repository.findActiveRefreshTokenByFamily(
      (await repository.findRefreshTokenWithUser(succeeded?.refreshToken ?? ""))
        ?.familyId ?? "",
    );

    expect(activeTokens).not.toBeNull();
  });
});
