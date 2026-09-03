import { describe, it, expect, vi } from "vitest";
import { processEmail } from "@/jobs/email.job";
import nodemailer from "nodemailer";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({}),
    }),
  },
}));

describe("email.job", () => {
  it("should send email with default template", async () => {
    const job = {
      data: {
        to: "test@test.com",
        subject: "Hello",
        template: undefined,
        data: { name: "John" },
      },
    };
    await processEmail(job);
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@test.com",
        subject: "Hello",
        html: expect.stringContaining("John"),
      }),
    );
  });

  it("should send welcome template", async () => {
    const job = {
      data: {
        to: "test@test.com",
        subject: "Welcome",
        template: "welcome",
        data: { name: "Jane" },
      },
    };
    await processEmail(job);
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Welcome to TriAD!"),
      }),
    );
  });

  it("should send order-confirmation template", async () => {
    const job = {
      data: {
        to: "test@test.com",
        subject: "Order",
        template: "order-confirmation",
        data: { orderNumber: "ORD-123", total: 100 },
      },
    };
    await processEmail(job);
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("ORD-123"),
      }),
    );
  });

  it("should send verify-email template", async () => {
    const job = {
      data: {
        to: "test@test.com",
        subject: "Verify",
        template: "verify-email",
        data: { name: "John", verifyUrl: "https://example.com/verify" },
      },
    };
    await processEmail(job);
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Verify my email"),
      }),
    );
  });
});
