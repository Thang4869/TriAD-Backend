import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("OpenTelemetry NodeSDK startup and shutdown (B10)", () => {
  it.each(["true", "false"])(
    "initializes and shuts down with ENABLE_TRACING=%s",
    (enabled) => {
      // Fresh process prevents global OTel tracer and instrumentation state
      // from leaking between this test and unrelated application tests.
      const child = spawnSync(
        process.execPath,
        [
          "-r",
          "ts-node/register",
          "-r",
          "tsconfig-paths/register",
          "-e",
          [
            'const { shutdownTracing } = require("./src/core/tracing/tracing");',
            'shutdownTracing().then(() => process.stdout.write("OTEL_SHUTDOWN_OK\\n"))',
            '.catch((error) => { console.error(error); process.exitCode = 1; });',
          ].join(""),
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 20_000,
          env: {
            ...process.env,
            TS_NODE_BASEURL: "./",
            ENABLE_TRACING: enabled,
            OTEL_SERVICE_NAME: "triad-ci-otel-smoke",
            OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/v1/traces",
          },
        },
      );
      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      expect(child.stdout).toContain("OTEL_SHUTDOWN_OK");
    },
    25_000,
  );
});
