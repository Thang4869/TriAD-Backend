import { describe, it, expect, vi, beforeEach } from "vitest";
import { User } from "@prisma/client";
import { UsersService } from "@modules/users/users.service";
import { IUsersRepository } from "@modules/users/users.repository";
import { NotFoundError, BadRequestError } from "@shared/utils/errors";

vi.mock("bcrypt", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));
import bcrypt from "bcrypt";

function createFakeRepository(
  overrides: Partial<IUsersRepository> = {},
): IUsersRepository {
  return {
    findProfileById: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    updateProfile: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseUser: User = {
  id: "user-1",
  email: "user1@test.com",
  password: "old-hashed-password",
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

describe("UsersService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getProfile", () => {
    it("ném NotFoundError khi user không tồn tại", async () => {
      const repository = createFakeRepository({
        findProfileById: vi.fn().mockResolvedValue(null),
      });
      const service = new UsersService(repository);

      await expect(service.getProfile("missing")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("trả về profile khi tìm thấy", async () => {
      const repository = createFakeRepository({
        findProfileById: vi
          .fn()
          .mockResolvedValue({ id: "user-1", email: "user1@test.com" }),
      });
      const service = new UsersService(repository);

      const result = await service.getProfile("user-1");

      expect(result).toMatchObject({ id: "user-1" });
    });
  });

  describe("updateProfile", () => {
    it("ném NotFoundError khi user không tồn tại", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = new UsersService(repository);

      await expect(
        service.updateProfile("missing", { firstName: "New" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.updateProfile).not.toHaveBeenCalled();
    });

    it("cập nhật profile thành công khi user tồn tại", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseUser),
        updateProfile: vi
          .fn()
          .mockResolvedValue({ ...baseUser, firstName: "New" }),
      });
      const service = new UsersService(repository);

      await service.updateProfile("user-1", { firstName: "New" });

      expect(repository.updateProfile).toHaveBeenCalledWith("user-1", {
        firstName: "New",
      });
    });
  });

  describe("changePassword", () => {
    it("ném NotFoundError khi user không tồn tại", async () => {
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = new UsersService(repository);

      await expect(
        service.changePassword("missing", "old", "new"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("ném BadRequestError khi mật khẩu hiện tại sai", async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new UsersService(repository);

      await expect(
        service.changePassword("user-1", "wrong-old-password", "new-password"),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repository.updatePassword).not.toHaveBeenCalled();
    });

    it("đổi mật khẩu thành công khi mật khẩu hiện tại đúng", async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "new-hashed",
      );
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(baseUser),
      });
      const service = new UsersService(repository);

      const result = await service.changePassword(
        "user-1",
        "correct-old",
        "new-password",
      );

      expect(repository.updatePassword).toHaveBeenCalledWith(
        "user-1",
        "new-hashed",
      );
      expect(result).toEqual({ success: true });
    });

    it("dùng chuỗi rỗng làm mật khẩu hash khi user.password là null (OAuth user chưa set password)", async () => {
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      const oauthUser = { ...baseUser, password: null } as User;
      const repository = createFakeRepository({
        findById: vi.fn().mockResolvedValue(oauthUser),
      });
      const service = new UsersService(repository);

      await expect(
        service.changePassword("user-1", "anything", "new-password"),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(bcrypt.compare).toHaveBeenCalledWith("anything", "");
    });
  });
});
