# OpenTelemetry staging acceptance

**Status:** hosted staging OTLP ingestion and trace visibility verified; scoped Issue #141 acceptance complete.
**Last checked:** 2026-11-25
**Related:** Issue #141 (B10 / hosted tracing evidence)

## Receiver decision

Grafana Cloud Free is the hosted OTLP receiver for TriAD staging. The stack and `traces:write` access policy were provisioned, and the OTLP configuration was saved in the Render `triad-api-staging` environment. The deployed service exports traces using HTTP/protobuf. On 2026-11-25, Grafana Explore returned traces for `triad-api-staging`, including HTTP server spans and child network spans; the trace detail view confirmed parent/child relationships and durations. This verifies receiver ingestion and visibility, not complete instrumentation coverage, full sensitive-attribute review, graceful-shutdown verification, or a production SLO. Never store or publish the token or authorization value in this document.

## Current verified application state

- `src/core/tracing/tracing.ts` initializes the OpenTelemetry NodeSDK only when `ENABLE_TRACING=true`.
- The exporter now uses the OpenTelemetry SDK's standard environment configuration for the endpoint and authentication headers.
- `OTEL_EXPORTER_OTLP_ENDPOINT` is the base URL; the SDK appends `/v1/traces`. `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is the complete traces URL and must end in `/v1/traces`.
- Authentication can be supplied through `OTEL_EXPORTER_OTLP_TRACES_HEADERS`, using the standard comma-separated `key=value` format. The traces-specific header takes precedence over a shared header with the same key.
- In production, enabling tracing requires an explicitly configured OTLP endpoint using HTTPS. Endpoints containing user information, query strings, or fragments are rejected.
- Startup logs no longer print the exporter endpoint or authentication headers.
- `.env.example` keeps `ENABLE_TRACING=false`; endpoint and header examples remain commented out.
- `render.yaml` enables `ENABLE_TRACING=true` for the hosted staging service; `.env.example` intentionally retains `ENABLE_TRACING=false` as the safe local default.
- The exporter integration test uses a local HTTP receiver to verify that the configured authorization header is sent and is not printed to stdout/stderr.
- `tests/unit/core/tracing/tracing-startup.test.ts` also verifies SDK startup/shutdown and fail-closed production configuration. These tests do not prove delivery to Grafana Cloud.
- `docker-compose.prod.yml` defines a local Compose collector at `otel-collector:4318`, with a debug exporter. It is not the hosted Grafana Cloud receiver.

## Security and remaining verification

Keep Grafana Cloud authentication only in Render's secret-backed environment configuration. Never put credentials in the endpoint URL, source code, committed environment files, logs, issue comments, or screenshots. Use the narrowest token permissions available and rotate/revoke a token if it is exposed.

The verified trace demonstrates receiver ingestion and visibility. The following broader operational checks are not claimed complete by that evidence: current Free-plan limits/retention/data-handling review, full trace-attribute inspection for sensitive data, graceful-shutdown flush verification, and complete instrumentation/context-propagation coverage. These are broader observability hardening tasks, not blockers for the scoped Issue #141 acceptance already recorded.

## Acceptance checklist

- [x] Grafana Cloud Free selected as the intended hosted receiver.
- [x] Standard OTLP endpoint/header configuration and production HTTPS guard implemented.
- [x] Local exporter test verifies auth header delivery and absence of secret logging.
- [x] Grafana Cloud stack, traces-only access policy, and OTLP token provisioned.
- [ ] Current Free limits, retention, region and data handling verified.
- [x] Hosted OTLP endpoint and authentication configured in Render staging environment.
- [x] Owner approved saving the staging environment configuration.
- [x] Staging tracing enabled with the configured hosted HTTPS OTLP receiver.
- [x] Grafana Explore shows traces from `triad-api-staging` after a controlled staging request.
- [x] HTTP server spans and child network spans are visible; parent/child relationships and durations were inspected.
- [x] Sanitized exporter diagnostics are deployed; credentials, authorization headers and request payloads are not logged.
- [ ] Full trace-attribute review for sensitive data.
- [ ] Graceful-shutdown flush verification.
- [ ] Current Free-plan limits, retention and data-handling review.

The scoped Issue #141 hosted ingestion/visibility acceptance is complete. The unchecked items above are broader operational hardening and must not be represented as completed.
