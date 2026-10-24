import net, { type Socket } from "node:net";
import { once } from "node:events";
import { setImmediate } from "node:timers/promises";
import { expect, it, vi } from "vitest";

vi.mock("@core/logger/winston", () => ({ logger: { info: vi.fn() } }));

it("rejects a silent SMTP greeting within 10 seconds so the email job can retry", async () => {
  const sockets = new Set<Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.resume();
    // Accept TCP but deliberately send no SMTP greeting.
  });
  const connect = vi.spyOn(net, "connect");
  let delivery: Promise<void> | undefined;

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a loopback TCP address");
    }
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", String(address.port));
    vi.stubEnv("SMTP_USER", "fixture");
    vi.stubEnv("SMTP_PASS", "fixture");
    vi.stubEnv("SMTP_FROM", "sender@example.invalid");
    vi.resetModules();
    const { processEmail } = await import("@/jobs/email.job");

    // Keep real TCP I/O; advance only Nodemailer's phase timers and clock.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const accepted = once(server, "connection");
    const settled = vi.fn();
    delivery = processEmail({
      data: { to: "recipient@example.invalid", subject: "Timeout regression" },
    }).then(
      (value) => {
        settled({ status: "fulfilled", value });
      },
      (error: unknown) => {
        settled({ status: "rejected", error });
      },
    );
    const [peer] = (await accepted) as [Socket];
    const client = connect.mock.results[0].value as Socket;
    if (client.connecting) await once(client, "connect");
    await setImmediate();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    const closed = once(peer, "close");
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith({
      status: "rejected",
      error: expect.objectContaining({ code: "ETIMEDOUT" }),
    });
    await delivery;
    await closed;
  } finally {
    for (const socket of sockets) socket.destroy();
    vi.useRealTimers();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await delivery;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
