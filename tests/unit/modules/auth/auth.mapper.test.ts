import { toAuthUserResponse } from "@modules/auth/auth.mapper";
import { User } from "@prisma/client";
import { describe, expect, it } from "vitest";

describe("AuthMapper", () => {
  it("maps user to response excluding password", () => {
    const user: User = {
      id: "1",
      email: "a@b.com",
      firstName: "A",
      lastName: "B",
      role: "USER",
      is2FAEnabled: true,
      password: "hash",
      phone: null,
      isVerified: true,
      totpSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    const result = toAuthUserResponse(user);
    expect(result).not.toHaveProperty("password");
    expect(result.id).toBe("1");
  });
});
