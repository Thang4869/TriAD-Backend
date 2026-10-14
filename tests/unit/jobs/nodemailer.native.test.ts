import nodemailer from "nodemailer";
import { describe, expect, it } from "vitest";

describe("Nodemailer native MIME composition (B10 major upgrade)", () => {
  it("composes a UTF-8 verification email without connecting to SMTP", async () => {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
    });
    const result = await transport.sendMail({
      from: '"TriAD" <noreply@example.com>',
      to: "recipient@example.com",
      subject: "Verify your TriAD account",
      html: '<p>Verify your account</p><a href="https://app.example.com/verify-email?token=test">Verify</a>',
    });
    const raw = result.message.toString();
    expect(raw).toContain("Subject: Verify your TriAD account");
    expect(raw).toContain("recipient@example.com");
    expect(raw).toContain("verify-email?token=test");
    transport.close();
  });
});
