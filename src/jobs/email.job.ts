import nodemailer from "nodemailer";
import { logger } from "@core/logger/winston";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const processEmail = async (job: any) => {
  const { to, subject, template, data } = job.data;
  logger.info(`Sending email to ${to} with subject "${subject}"`);

  let html = `<h1>${subject}</h1><p>Hello ${data?.name || ""}</p>`;
  if (template === "welcome") {
    html = `<h1>Welcome to TriAD!</h1><p>Hi ${data?.name}, thanks for joining!</p>`;
  } else if (template === "order-confirmation") {
    html = `<h1>Order Confirmation</h1><p>Your order #${data?.orderNumber} is confirmed. Total: ${data?.total}</p>`;
  } else if (template === "verify-email") {
    html = `
      <h1>Verify your TriAD account</h1>
      <p>Hi ${data?.name || ""},</p>
      <p>Please confirm your email address by clicking the link below. This link expires in 24 hours.</p>
      <p><a href="${data?.verifyUrl}" target="_blank">Verify my email</a></p>
      <p>If the button doesn't work, copy and paste this URL into your browser:</p>
      <p>${data?.verifyUrl}</p>
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