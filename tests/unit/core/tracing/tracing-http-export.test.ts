import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("OpenTelemetry HTTP auto-instrumentation export", () => {
  it("exports an inbound Express HTTP span to an OTLP receiver", () => {
    const code = [
      'const http = require("node:http");',
      "const received = [];",
      "const receiver = http.createServer((req, res) => {",
      "  const chunks = [];",
      '  req.on("data", (chunk) => chunks.push(chunk));',
      '  req.on("end", () => {',
      '    received.push({ method: req.method, url: req.url, contentType: req.headers["content-type"], body: Buffer.concat(chunks) });',
      "    res.writeHead(200); res.end();",
      "  });",
      "});",
      "const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));",
      'receiver.listen(0, "127.0.0.1", async () => {',
      "  let appServer;",
      "  try {",
      '    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://127.0.0.1:" + receiver.address().port + "/v1/traces";',
      '    process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS = "";',
      '    process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf";',
      '    require("./src/core/tracing/tracing");',
      '    const express = require("express");',
      "    const app = express();",
      '    app.get("/otel-test", (_req, res) => res.status(200).send("ok"));',
      '    appServer = app.listen(0, "127.0.0.1", () => {',
      '      http.get({ host: "127.0.0.1", port: appServer.address().port, path: "/otel-test" }, async (response) => {',
      "        response.resume();",
      '        response.on("end", async () => {',
      "          try {",
      "            await close(appServer);",
      '            const { shutdownTracing } = require("./src/core/tracing/tracing");',
      "            await shutdownTracing();",
      '            const exported = received.filter((item) => item.method === "POST" && item.url === "/v1/traces");',
      "            const payload = Buffer.concat(exported.map((item) => item.body));",
      '            const hasServiceName = payload.includes(Buffer.from("triad-ci-http-export"));',
      '            const hasRouteName = payload.includes(Buffer.from("/otel-test"));',
      '            const contentType = exported[0]?.contentType || "";',
      '            const supportedContentType = contentType === "application/json" || contentType === "application/x-protobuf";',
      '            process.stdout.write("HTTP_STATUS=" + response.statusCode + "\\n");',
      '            process.stdout.write("OTLP_REQUESTS=" + exported.length + "\\n");',
      '            process.stdout.write("OTLP_CONTENT_TYPE_SUPPORTED=" + supportedContentType + "\\n");',
      '            process.stdout.write("OTLP_PAYLOAD_BYTES=" + payload.length + "\\n");',
      '            process.stdout.write("SERVICE_NAME_PRESENT=" + hasServiceName + "\\n");',
      '            process.stdout.write("HTTP_ROUTE_PRESENT=" + hasRouteName + "\\n");',
      "            await close(receiver);",
      "            if (response.statusCode !== 200 || exported.length === 0 || payload.length === 0 || !supportedContentType || !hasServiceName || !hasRouteName) process.exitCode = 1;",
      "          } catch (error) { console.error(error); process.exitCode = 1; await close(receiver); }",
      "        });",
      '      }).on("error", async (error) => { console.error(error); process.exitCode = 1; if (appServer) await close(appServer); await close(receiver); });',
      "    });",
      "  } catch (error) { console.error(error); process.exitCode = 1; if (appServer) await close(appServer); await close(receiver); }",
      "});",
    ].join(String.fromCharCode(10));

    const child = spawnSync(
      process.execPath,
      ["-r", "ts-node/register", "-r", "tsconfig-paths/register", "-e", code],
      {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 60_000,
        env: {
          ...process.env,
          NODE_ENV: "test",
          ENABLE_TRACING: "true",
          OTEL_SERVICE_NAME: "triad-ci-http-export",
          OTEL_EXPORTER_OTLP_ENDPOINT: "",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
          OTEL_EXPORTER_OTLP_TRACES_HEADERS: "",
        },
      },
    );

    expect(child.error).toBeUndefined();
    expect(child.status, String(child.stderr)).toBe(0);
    expect(child.stdout).toContain("HTTP_STATUS=200");
    expect(child.stdout).toContain("OTLP_REQUESTS=1");
    expect(child.stdout).toContain("OTLP_CONTENT_TYPE_SUPPORTED=true");
    expect(child.stdout).toContain("SERVICE_NAME_PRESENT=true");
    expect(child.stdout).toContain("HTTP_ROUTE_PRESENT=true");
  }, 70_000);
});
