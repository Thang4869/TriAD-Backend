import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { hashPassword, comparePassword } from "@shared/utils/bcrypt";
import { SECURITY } from "@shared/constants/security.constant";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

const mockedBcrypt = vi.mocked(bcrypt);

describe("bcrypt utils", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hashPassword dùng đúng số salt rounds cấu hình trong SECURITY", async () => {
    mockedBcrypt.hash.mockResolvedValue("hashed" as never);

    const result = await hashPassword("secret123");

    expect(mockedBcrypt.hash).toHaveBeenCalledWith(
      "secret123",
      SECURITY.BCRYPT_SALT_ROUNDS,
    );
    expect(result).toBe("hashed");
  });

  it("comparePassword trả true khi bcrypt xác nhận khớp", async () => {
    mockedBcrypt.compare.mockResolvedValue(true as never);

    await expect(comparePassword("secret123", "hashed")).resolves.toBe(true);
    expect(mockedBcrypt.compare).toHaveBeenCalledWith("secret123", "hashed");
  });

  it("comparePassword trả false khi mật khẩu sai", async () => {
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(comparePassword("wrong", "hashed")).resolves.toBe(false);
  });

  it("lỗi từ bcrypt được ném ra ngoài, không bị nuốt", async () => {
    mockedBcrypt.hash.mockRejectedValue(new Error("bcrypt failed") as never);

    await expect(hashPassword("secret123")).rejects.toThrow("bcrypt failed");
  });
});
