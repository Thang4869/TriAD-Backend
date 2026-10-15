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
        html: expect.stringContaining("This link expires in 15 minutes."),
      }),
    );
  });

  it("should send verify-email template with empty greeting when name is missing", async () => {
    const job = {
      data: {
        to: "test@test.com",
        subject: "Verify",
        template: "verify-email",
        data: { verifyUrl: "https://example.com/verify" },
      },
    };
    await processEmail(job);
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("<p>Hi ,</p>"),
      }),
    );
  });
  it("escapes untrusted HTML in email templates", async () => {
    await processEmail({
      data: {
        to: "test@test.com",
        subject: "<script>alert(1)</script>",
        data: { name: '<img src=x onerror="alert(1)">' },
      },
    });
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    const html = transporter.sendMail.mock.lastCall[0].html as string;
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("escapes quotes and markup in verification links", async () => {
    await processEmail({
      data: {
        to: "test@test.com",
        subject: "Verify",
        template: "verify-email",
        data: {
          verifyUrl: 'https://example.com/verify?token="><img src=x>',
        },
      },
    });
    const transporter = (nodemailer.createTransport as any).mock.results[0]
      .value;
    const html = transporter.sendMail.mock.lastCall[0].html as string;
    expect(html).toContain("&quot;&gt;&lt;img src=x&gt;");
    expect(html).not.toContain("<img");
  });

});
