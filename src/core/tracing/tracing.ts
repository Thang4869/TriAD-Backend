import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { logger } from "@core/logger/winston";

const OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "triad-backend";
const isTracingEnabled = process.env.ENABLE_TRACING === "true";

if (isTracingEnabled) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "unknown",
    }),
    traceExporter: new OTLPTraceExporter({ url: OTLP_ENDPOINT }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  logger.info(`OpenTelemetry tracing started, exporting to ${OTLP_ENDPOINT}`);

  process.on("SIGTERM", () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
} else {
  logger.info(
    "OpenTelemetry tracing disabled (set ENABLE_TRACING=true to enable)",
  );
}
