import { describe, it, expect, vi } from "vitest";
import { generateTOTPSecret, verifyTOTP } from "@shared/utils/totp";
import speakeasy from "speakeasy";

vi.mock("speakeasy", () => ({
  default: {
    generateSecret: vi.fn().mockReturnValue({
      base32: "mocked-secret",
      otpauth_url: "otpauth://totp/TriAD:test?secret=mocked-secret",
    }),
    totp: {
      verify: vi.fn().mockReturnValue(true),
    },
  },
}));

describe("totp utils", () => {
  it("generateTOTPSecret should call speakeasy with correct params", () => {
    const result = generateTOTPSecret("test@example.com", "MyApp");
    expect(speakeasy.generateSecret).toHaveBeenCalledWith({
      name: "MyApp:test@example.com",
      issuer: "MyApp",
    });
    expect(result).toEqual({
      base32: "mocked-secret",
      otpauth_url: "otpauth://totp/TriAD:test?secret=mocked-secret",
    });
  });

  it("verifyTOTP should call speakeasy.totp.verify", () => {
    const result = verifyTOTP("secret", "123456", 2);
    expect(speakeasy.totp.verify).toHaveBeenCalledWith({
      secret: "secret",
      encoding: "base32",
      token: "123456",
      window: 2,
    });
    expect(result).toBe(true);
  });
});
