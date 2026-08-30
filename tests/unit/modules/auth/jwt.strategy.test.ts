// tests/unit/modules/auth/jwt.strategy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { User } from "@prisma/client";

// -------- MOCK REPOSITORY: class with vi.fn() --------
const mockFindUserById = vi.fn();

vi.mock("@modules/auth/auth.repository", () => ({
  PrismaAuthRepository: class {
    findUserById = mockFindUserById;
  },
}));

// -------- CAPTURE the verify callback from passport-jwt --------
type VerifyCallback = (
  payload: { sub: string },
  done: (err: unknown, user?: User | false) => void,
) => Promise<void>;

let capturedVerifyCallback: VerifyCallback;

// -------- MOCK --------
vi.mock("passport-jwt", () => ({
  Strategy: class {
    constructor(_options: any, verify: VerifyCallback) {
      capturedVerifyCallback = verify;
    }
    name = "jwt";
  },
  ExtractJwt: { fromAuthHeaderAsBearerToken: () => vi.fn() },
}));

vi.mock("passport", () => ({
  default: { use: vi.fn() },
}));

// -------- TEST DATA --------
const baseUser: User = {
  id: "user-1",
  email: "user1@test.com",
  password: "hashed",
  firstName: "John",
  lastName: "Doe",
  phone: null,
  role: "USER",
  isVerified: true,
  is2FAEnabled: false,
  totpSecret: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as User;

describe("jwt.strategy", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.JWT_ACCESS_SECRET = "test-secret";
    await import("@modules/auth/strategies/jwt.strategy");
  });

  it("gọi done(UnauthorizedError, false) khi user không tồn tại", async () => {
    mockFindUserById.mockResolvedValueOnce(null);
    const done = vi.fn();
    await capturedVerifyCallback({ sub: "missing-id" }, done);
    // Kiểm tra error có message chính xác
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ message: "User not found or not verified" }),
      false,
    );
  });

  it("gọi done(UnauthorizedError, false) khi user tồn tại nhưng chưa verify email", async () => {
    mockFindUserById.mockResolvedValueOnce({ ...baseUser, isVerified: false });
    const done = vi.fn();
    await capturedVerifyCallback({ sub: "user-1" }, done);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ message: "User not found or not verified" }),
      false,
    );
  });

  it("gọi done(null, user) khi user tồn tại và đã verify", async () => {
    mockFindUserById.mockResolvedValueOnce(baseUser);
    const done = vi.fn();
    await capturedVerifyCallback({ sub: "user-1" }, done);
    expect(done).toHaveBeenCalledWith(null, baseUser);
  });

  it("gọi done(error, false) khi repository ném exception (DB lỗi)", async () => {
    const dbError = new Error("Connection refused");
    mockFindUserById.mockRejectedValueOnce(dbError);
    const done = vi.fn();
    await capturedVerifyCallback({ sub: "user-1" }, done);
    expect(done).toHaveBeenCalledWith(dbError, false);
  });
});
