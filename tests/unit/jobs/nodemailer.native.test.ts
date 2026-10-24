import { fork } from "node:child_process";
import { once } from "node:events";
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
    expect(raw).toContain("Content-Type: text/html");
    expect(raw).toContain("Verify your account");
    transport.close();
  });
  it("authenticates and delivers once to the disposable local SMTP sink", async () => {
    const sink = fork("scripts/acceptance/recovery-smtp.cjs", {
      execArgv: [],
      env: {
        ...process.env,
        RECOVERY_RUNTIME_ENABLED: "true",
        RECOVERY_SMTP_PORT: "0",
        RECOVERY_SMTP_HTTP_PORT: "0",
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
    try {
      const [ports] = (await once(sink, "message", {
        signal: AbortSignal.timeout(5000),
      })) as [{ smtp: number; http: number }];
      transport = nodemailer.createTransport({
        host: "127.0.0.1",
        port: ports.smtp,
        secure: false,
        ignoreTLS: true,
        auth: { user: "fixture", pass: "fixture" },
        connectionTimeout: 3000,
        socketTimeout: 3000,
      });
      const result = await transport.sendMail({
        from: "sender@example.invalid",
        to: "recipient@example.invalid",
        subject: "TriAD SMTP upgrade regression",
        text: "Disposable test only",
      });
      expect(result.accepted).toEqual(["recipient@example.invalid"]);
      const response = await fetch(`http://127.0.0.1:${ports.http}`);
      expect(await response.json()).toEqual({ messages: 1 });
    } finally {
      transport?.close();
      const exited = once(sink, "exit");
      sink.kill();
      await exited;
    }
  });
});
