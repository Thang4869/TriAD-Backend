import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { tracingServiceResource } from "@core/tracing/tracing-resource";
import { logger } from "@core/logger/winston";

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "triad-backend";
const isTracingEnabled = process.env.ENABLE_TRACING === "true";

function validateConfiguredEndpoint(): void {
  const tracesEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const baseEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const configuredEndpoint = tracesEndpoint || baseEndpoint;

  if (process.env.NODE_ENV === "production" && !configuredEndpoint) {
    throw new Error(
      "OpenTelemetry tracing in production requires an explicit OTLP endpoint",
    );
  }

  if (!configuredEndpoint) {
    return;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(configuredEndpoint);
  } catch {
    throw new Error("OpenTelemetry OTLP endpoint must be a valid URL");
  }

  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      "OpenTelemetry OTLP endpoint must not contain credentials, query parameters, or fragments",
    );
  }

  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("OpenTelemetry OTLP endpoint must use HTTP or HTTPS");
  }

  if (
    !tracesEndpoint &&
    endpoint.pathname.replace(/\/$/, "").endsWith("/v1/traces")
  ) {
    throw new Error(
      "OTEL_EXPORTER_OTLP_ENDPOINT must be a base URL, not a traces URL",
    );
  }

  if (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") {
    throw new Error("OpenTelemetry OTLP endpoint must use HTTPS in production");
  }

  if (
    tracesEndpoint &&
    !endpoint.pathname.replace(/\/$/, "").endsWith("/v1/traces")
  ) {
    throw new Error(
      "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT must include the /v1/traces path",
    );
  }
}

let sdk: NodeSDK | null = null;

if (isTracingEnabled) {
  validateConfiguredEndpoint();

  sdk = new NodeSDK({
    resource: tracingServiceResource(
      SERVICE_NAME,
      process.env.npm_package_version || "unknown",
    ),
    // The exporter reads standard OTEL_EXPORTER_OTLP_* endpoint and header
    // variables. Keep credentials in the hosting secret store, never in code.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();

  // Never log the endpoint or headers: either may reveal infrastructure details.
  logger.info("OpenTelemetry tracing started");
} else {
  logger.info(
    "OpenTelemetry tracing disabled (set ENABLE_TRACING=true to enable)",
  );
}

export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
  sdk = null;

  logger.info("OpenTelemetry tracing stopped");
}
