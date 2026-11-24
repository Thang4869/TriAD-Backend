import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function runChild(
  code: string,
  overrides: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TS_NODE_BASEURL: "./",
    TS_NODE_TRANSPILE_ONLY: "true",
    ...overrides,
  };

  return spawnSync(
    process.execPath,
    ["-r", "ts-node/register", "-r", "tsconfig-paths/register", "-e", code],
    {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 120_000,
      env,
    },
  );
}

describe("OpenTelemetry NodeSDK startup and shutdown (B10)", () => {
  it.each(["true", "false"])(
    "initializes and shuts down with ENABLE_TRACING=%s",
    (enabled) => {
      const child = runChild(
        [
          'const { shutdownTracing } = require("./src/core/tracing/tracing");',
          'shutdownTracing().then(() => process.stdout.write("OTEL_SHUTDOWN_OK\\n"))',
          ".catch((error) => { console.error(error); process.exitCode = 1; });",
        ].join(""),
        {
          NODE_ENV: "test",
          ENABLE_TRACING: enabled,
          OTEL_SERVICE_NAME: "triad-ci-otel-smoke",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
          OTEL_EXPORTER_OTLP_TRACES_HEADERS: "",
        },
      );

      expect(child.error).toBeUndefined();
      expect(child.status, String(child.stderr)).toBe(0);
      expect(child.stdout).toContain("OTEL_SHUTDOWN_OK");
    },
    130_000,
  );

  it("exports traces with the configured auth header without logging the secret", () => {
    const secret = "triad-otel-test-secret";
    const child = runChild(
      [
        'const http = require("node:http");',
        "const server = http.createServer((req, res) => {",
        "  const authorized = req.headers.authorization === 'Bearer ' + process.env.TEST_OTEL_SECRET;",
        "  req.resume();",
        '  req.on("end", () => {',
        '    process.stdout.write("OTEL_AUTH_HEADER_PRESENT=" + authorized + "\\n");',
        "    res.writeHead(200); res.end();",
        "  });",
        "});",
        "server.listen(0, '127.0.0.1', async () => {",
        "  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:' + server.address().port + '/v1/traces';",
        "  process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS = 'authorization=Bearer ' + process.env.TEST_OTEL_SECRET;",
        '  const { shutdownTracing } = require("./src/core/tracing/tracing");',
        '  const { trace } = require("@opentelemetry/api");',
        '  trace.getTracer("triad-otel-test").startSpan("auth-header-test").end();',
        "  await shutdownTracing();",
        '  server.close(() => process.stdout.write("OTEL_TEST_COMPLETE\\n"));',
        "});",
      ].join(""),
      {
        NODE_ENV: "test",
        ENABLE_TRACING: "true",
        OTEL_SERVICE_NAME: "triad-ci-otel-auth-test",
        TEST_OTEL_SECRET: secret,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: "",
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, String(child.stderr)).toBe(0);
    expect(child.stdout).toContain("OTEL_AUTH_HEADER_PRESENT=true");
    expect(child.stdout).toContain("OTEL_TEST_COMPLETE");
    expect(child.stdout).not.toContain(secret);
    expect(child.stderr).not.toContain(secret);
  }, 45_000);

  it("logs sanitized diagnostics when the OTLP receiver rejects an export", () => {
    const secret = "triad-otel-rejected-export-secret";
    const child = runChild(
      [
        'const http = require("node:http");',
        'const server = http.createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(403); res.end("forbidden"); }); });',
        'server.listen(0, "127.0.0.1", async () => {',
        '  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://127.0.0.1:" + server.address().port + "/v1/traces";',
        '  process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS = "authorization=Bearer " + process.env.TEST_OTEL_SECRET;',
        '  const { shutdownTracing } = require("./src/core/tracing/tracing");',
        '  const { trace } = require("@opentelemetry/api");',
        '  trace.getTracer("triad-otel-test").startSpan("rejected-export-test").end();',
        '  await shutdownTracing().catch(() => process.stdout.write("OTEL_EXPORT_REJECTION_HANDLED\\n"));',
        '  server.close(() => process.stdout.write("OTEL_REJECTED_EXPORT_TEST_COMPLETE\\n"));',
        "});",
      ].join(""),
      {
        NODE_ENV: "test",
        ENABLE_TRACING: "true",
        OTEL_SERVICE_NAME: "triad-ci-otel-rejection-test",
        TEST_OTEL_SECRET: secret,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: "",
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, String(child.stderr) + String(child.stdout)).toBe(0);
    expect(child.stdout).toContain("OpenTelemetry trace export failed");
    expect(child.stdout).toContain('"httpStatusCode":403');
    expect(child.stdout).toContain("OTEL_EXPORT_REJECTION_HANDLED");
    expect(child.stdout).toContain("OTEL_REJECTED_EXPORT_TEST_COMPLETE");
    expect(child.stdout).not.toContain(secret);
    expect(child.stderr).not.toContain(secret);
  }, 45_000);

  it("fails closed when production tracing has no explicit OTLP endpoint", () => {
    const child = runChild(
      'try { require("./src/core/tracing/tracing"); process.exitCode = 2; } catch (error) { process.stdout.write(String(error.message)); }',
      {
        NODE_ENV: "production",
        ENABLE_TRACING: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: "",
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain("requires an explicit OTLP endpoint");
    expect(child.stdout).not.toContain("localhost");
  });
});
