import { trace, SpanStatusCode, Attributes } from "@opentelemetry/api";

const tracer = trace.getTracer("triad-backend.business");

export async function withSpan<T>(
  name: string,
  fn: (setAttributes: (attrs: Attributes) => void) => Promise<T>,
  attributes?: Attributes,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) span.setAttributes(attributes);
    try {
      const result = await fn((attrs) => span.setAttributes(attrs));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
