import nodemailer from "nodemailer";
import { logger } from "@core/logger/winston";

interface EmailJobData {
  to: string;
  subject: string;
  template?: string;
  data?: Record<string, unknown>;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

export const processEmail = async (job: { data: EmailJobData }) => {
  const { to, subject, template, data } = job.data;
  logger.info(`Sending email to ${to} with subject "${subject}"`);

  const name = escapeHtml(data?.name);
  const safeSubject = escapeHtml(subject);
  const verifyUrl = escapeHtml(data?.verifyUrl);
  let html = `<h1>${safeSubject}</h1><p>Hello ${name}</p>`;
  if (template === "welcome") {
    html = `<h1>Welcome to TriAD!</h1><p>Hi ${name}, thanks for joining!</p>`;
  } else if (template === "order-confirmation") {
    html = `<h1>Order Confirmation</h1><p>Your order #${escapeHtml(data?.orderNumber)} is confirmed. Total: ${escapeHtml(data?.total)}</p>`;
  } else if (template === "verify-email") {
    html = `
      <h1>Verify your TriAD account</h1>
      <p>Hi ${name},</p>
      <p>Please confirm your email address by clicking the link below. This link expires in 15 minutes.</p>
      <p><a href="${verifyUrl}" target="_blank">Verify my email</a></p>
      <p>If the button doesn't work, copy and paste this URL into your browser:</p>
      <p>${verifyUrl}</p>
    `;
  }

  await transporter.sendMail({
    from: `"TriAD" <${process.env.SMTP_FROM || "noreply@triad.com"}>`,
    to,
    subject,
    html,
  });

  return { success: true };
};
