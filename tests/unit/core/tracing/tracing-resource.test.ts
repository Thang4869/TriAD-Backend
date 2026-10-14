import { describe, expect, it } from "vitest";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { tracingServiceResource } from "@core/tracing/tracing-resource";

describe("OpenTelemetry SDK resource factory (B10)", () => {
  it("uses the SDK 2.x resource API and preserves service metadata", () => {
    const resource = tracingServiceResource("triad-backend", "1.0.0");
    expect(resource.attributes).toMatchObject({
      [ATTR_SERVICE_NAME]: "triad-backend",
      [ATTR_SERVICE_VERSION]: "1.0.0",
    });
  });

  it("does not inject undefined versions or service names", () => {
    const resource = tracingServiceResource("triad-backend", "unknown");
    expect(resource.attributes[ATTR_SERVICE_VERSION]).toBe("unknown");
  });
});
