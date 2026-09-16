import { describe, it, expect } from "vitest";
import { User } from "@modules/users/domain/user.entity";
import { ROLES } from "@shared/types/roles";
import {
  UserAlreadyVerifiedError,
  TwoFactorAlreadyEnabledError,
  TwoFactorNotSetUpError,
  TwoFactorNotEnabledError,
  WeakPasswordError,
} from "@shared/domain/errors/domain-error";

type UserData = Parameters<typeof User.hydrate>[0];

function userData(overrides: Partial<UserData> = {}): UserData {
  return {
    id: "user-1",
    email: "a@b.com",
    firstName: "Nguyen",
    lastName: "An",
    password: "hashed",
    role: ROLES.USER,
    isVerified: false,
    is2FAEnabled: false,
    totpSecret: null,
    phone: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("User.hydrate", () => {
  it("map đầy đủ field và không sinh event", () => {
    const user = User.hydrate(userData());

    expect(user.id).toBe("user-1");
    expect(user.email).toBe("a@b.com");
    expect(user.passwordHash).toBe("hashed");
    expect(user.isVerified).toBe(false);
    expect(user.domainEvents).toHaveLength(0);
  });

  it("fullName ghép firstName + lastName", () => {
    expect(User.hydrate(userData()).fullName).toBe("Nguyen An");
  });

  it("fullName trim khi thiếu một phần tên", () => {
    const user = User.hydrate(userData({ firstName: "", lastName: "An" }));

    expect(user.fullName).toBe("An");
  });
});

describe("User.registered", () => {
  it("raise UserRegistered kèm email trong metadata", () => {
    const user = User.registered(userData());

    expect(user.domainEvents).toHaveLength(1);
    expect(user.domainEvents[0].eventName).toBe("UserRegistered");
    expect(user.domainEvents[0].metadata).toEqual({ email: "a@b.com" });
  });
});

describe("User.assertPasswordPolicy", () => {
  it("chấp nhận mật khẩu đủ 6 ký tự", () => {
    const user = User.hydrate(userData());

    expect(() => user.assertPasswordPolicy("123456")).not.toThrow();
  });

  it("từ chối mật khẩu dưới 6 ký tự", () => {
    const user = User.hydrate(userData());

    expect(() => user.assertPasswordPolicy("12345")).toThrow(WeakPasswordError);
  });

  it("mật khẩu rỗng bị từ chối", () => {
    const user = User.hydrate(userData());

    expect(() => user.assertPasswordPolicy("")).toThrow(WeakPasswordError);
  });
});

describe("User.setHashedPassword", () => {
  it("ghi đè hash hiện tại", () => {
    const user = User.hydrate(userData());

    user.setHashedPassword("new-hash");

    expect(user.passwordHash).toBe("new-hash");
  });

  it("user OAuth (password null) có thể được đặt mật khẩu", () => {
    const user = User.hydrate(userData({ password: null }));
    expect(user.passwordHash).toBeNull();

    user.setHashedPassword("hash");

    expect(user.passwordHash).toBe("hash");
  });
});

describe("User.verify", () => {
  it("đánh dấu đã xác thực và raise UserEmailVerified", () => {
    const user = User.hydrate(userData({ isVerified: false }));

    user.verify();

    expect(user.isVerified).toBe(true);
    expect(user.domainEvents[0].eventName).toBe("UserEmailVerified");
  });

  it("verify lần hai bị chặn", () => {
    const user = User.hydrate(userData({ isVerified: true }));

    expect(() => user.verify()).toThrow(UserAlreadyVerifiedError);
  });
});

describe("User - luồng 2FA", () => {
  it("startEnabling2FA lưu secret nhưng chưa bật 2FA và chưa raise event", () => {
    const user = User.hydrate(userData());

    user.startEnabling2FA("SECRET123");

    expect(user.totpSecret).toBe("SECRET123");
    expect(user.is2FAEnabled).toBe(false);
    expect(user.domainEvents).toHaveLength(0);
  });

  it("startEnabling2FA khi đã bật 2FA bị chặn", () => {
    const user = User.hydrate(userData({ is2FAEnabled: true }));

    expect(() => user.startEnabling2FA("X")).toThrow(
      TwoFactorAlreadyEnabledError,
    );
  });

  it("confirm2FA sau khi có secret thì bật 2FA và raise event", () => {
    const user = User.hydrate(userData());
    user.startEnabling2FA("SECRET123");

    user.confirm2FA();

    expect(user.is2FAEnabled).toBe(true);
    expect(user.domainEvents[0].eventName).toBe("UserTwoFactorEnabled");
  });

  it("confirm2FA khi chưa setup secret bị chặn", () => {
    const user = User.hydrate(userData());

    expect(() => user.confirm2FA()).toThrow(TwoFactorNotSetUpError);
  });

  it("confirm2FA khi đã bật rồi bị chặn", () => {
    const user = User.hydrate(
      userData({ is2FAEnabled: true, totpSecret: "SECRET" }),
    );

    expect(() => user.confirm2FA()).toThrow(TwoFactorAlreadyEnabledError);
  });

  it("disable2FA xoá secret và raise UserTwoFactorDisabled", () => {
    const user = User.hydrate(
      userData({ is2FAEnabled: true, totpSecret: "SECRET" }),
    );

    user.disable2FA();

    expect(user.is2FAEnabled).toBe(false);
    expect(user.totpSecret).toBeNull();
    expect(user.domainEvents[0].eventName).toBe("UserTwoFactorDisabled");
  });

  it("disable2FA khi chưa bật bị chặn", () => {
    const user = User.hydrate(userData());

    expect(() => user.disable2FA()).toThrow(TwoFactorNotEnabledError);
  });
});

describe("User.updateProfile", () => {
  it("cập nhật từng phần, giữ nguyên field không truyền", () => {
    const user = User.hydrate(userData());

    user.updateProfile("Tran");

    expect(user.firstName).toBe("Tran");
    expect(user.lastName).toBe("An");
  });

  it("chuỗi rỗng bị coi là không cập nhật (falsy)", () => {
    const user = User.hydrate(userData());

    user.updateProfile("", "");

    expect(user.firstName).toBe("Nguyen");
    expect(user.lastName).toBe("An");
  });

  it("phone = chuỗi rỗng vẫn được ghi vì chỉ kiểm tra undefined", () => {
    const user = User.hydrate(userData({ phone: "0900000000" }));

    user.updateProfile(undefined, undefined, "");

    expect(user.phone).toBe("");
  });

  it("không truyền phone thì giữ nguyên giá trị cũ", () => {
    const user = User.hydrate(userData({ phone: "0900000000" }));

    user.updateProfile("Tran");

    expect(user.phone).toBe("0900000000");
  });

  it("updateProfile không raise domain event", () => {
    const user = User.hydrate(userData());

    user.updateProfile("Tran", "Binh", "0911111111");

    expect(user.domainEvents).toHaveLength(0);
  });
});
