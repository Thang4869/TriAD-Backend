# OpenTelemetry staging acceptance

**Status:** implementation prepared; Grafana Cloud and Render staging configuration saved; deployment and trace acceptance remain pending.
**Last checked:** 2026-11-25
**Related:** Issue #141 (B10 / hosted tracing evidence)

## Receiver decision

Grafana Cloud Free is the selected hosted OTLP receiver for the TriAD staging acceptance. The stack, `traces:write` access policy, and OTLP token have been provisioned. The endpoint, `http/protobuf` protocol, service name, authorization header, and `ENABLE_TRACING=true` have been saved in the Render `triad-api-staging` environment. The application has not yet been deployed with these settings, and no receiver-visible trace has been verified.

The current Free plan limits, retention, region, and data-handling terms still need confirmation against the Grafana Cloud account and official documentation. Do not assume a plan limit or retention period from an earlier review.

## Current verified application state

- `src/core/tracing/tracing.ts` initializes the OpenTelemetry NodeSDK only when `ENABLE_TRACING=true`.
- The exporter now uses the OpenTelemetry SDK's standard environment configuration for the endpoint and authentication headers.
- `OTEL_EXPORTER_OTLP_ENDPOINT` is the base URL; the SDK appends `/v1/traces`. `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is the complete traces URL and must end in `/v1/traces`.
- Authentication can be supplied through `OTEL_EXPORTER_OTLP_TRACES_HEADERS`, using the standard comma-separated `key=value` format. The traces-specific header takes precedence over a shared header with the same key.
- In production, enabling tracing requires an explicitly configured OTLP endpoint using HTTPS. Endpoints containing user information, query strings, or fragments are rejected.
- Startup logs no longer print the exporter endpoint or authentication headers.
- `.env.example` keeps `ENABLE_TRACING=false`; endpoint and header examples remain commented out.
- `render.yaml` continues to set `ENABLE_TRACING=false` for `triad-api-staging`.
- The exporter integration test uses a local HTTP receiver to verify that the configured authorization header is sent and is not printed to stdout/stderr.
- `tests/unit/core/tracing/tracing-startup.test.ts` also verifies SDK startup/shutdown and fail-closed production configuration. These tests do not prove delivery to Grafana Cloud.
- `docker-compose.prod.yml` defines a local Compose collector at `otel-collector:4318`, with a debug exporter. It is not the hosted Grafana Cloud receiver.

## Safety decision

**Do not enable tracing on Render yet.** Do not set the endpoint to `localhost`, the Compose-only hostname `otel-collector`, or an unverified URL. Do not change Render environment variables or trigger a deployment until the receiver is provisioned and the owner explicitly approves the staging change.

Never put credentials in the endpoint URL, source code, committed environment files, logs, issue comments, or screenshots. Store Grafana Cloud authentication only in Render's secret-backed environment configuration. Use the narrowest token permissions available and rotate/revoke it if it is exposed.

## Required work before enabling staging tracing

1. Provision a Grafana Cloud Free stack in the selected account. Verify current plan limits, retention, region, OTLP/HTTP endpoint, required authentication header, and data-handling terms.
2. Obtain the HTTPS traces endpoint and authentication value from Grafana Cloud. Keep the complete secret out of chat, source control, and local documentation.
3. Configure the endpoint as `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (full `/v1/traces` URL) or use the base `OTEL_EXPORTER_OTLP_ENDPOINT`. Configure the provider's required auth header in `OTEL_EXPORTER_OTLP_TRACES_HEADERS`. Do not configure both endpoint forms unless their precedence is intentional.
4. Confirm the receiver is reachable from the Render service and that its credentials are accepted. Do not expose an unauthenticated public collector.
5. Obtain explicit owner approval before changing only the existing staging service's environment. Preserve every existing environment variable; do not replace the full environment.
6. Deploy deliberately and verify startup reports tracing enabled without printing endpoint details or secrets.
7. Send a controlled synthetic request through the staging API. Verify a trace with `service.name=triad-backend`, a non-empty trace ID, and relevant HTTP/server spans is visible in Grafana Cloud.
8. Verify trace context propagation and ensure credentials, authorization headers, cookies, passwords, tokens, and sensitive request bodies do not appear in span attributes.
9. Verify graceful shutdown flushes spans and confirm receiver-side timestamps and service identity.
10. Record sanitized evidence (provider/plan, endpoint hostname only, deployment ID, test time, trace ID, span names, and acceptance result). Never publish the full endpoint if it contains sensitive path data, or any auth header/token.
11. If any check fails, disable tracing again and verify the application remains healthy. Do not claim OTLP acceptance based solely on a successful API response or SDK startup log.

## Acceptance checklist

- [x] Grafana Cloud Free selected as the intended hosted receiver.
- [x] Standard OTLP endpoint/header configuration and production HTTPS guard implemented.
- [x] Local exporter test verifies auth header delivery and absence of secret logging.
- [x] Grafana Cloud stack, traces-only access policy, and OTLP token provisioned.
- [ ] Current Free limits, retention, region and data handling verified.
- [x] Hosted OTLP endpoint and authentication configured in Render staging environment.
- [x] Owner approved saving the staging environment configuration.
- [ ] Staging tracing enabled with a verified HTTPS endpoint.
- [ ] Synthetic staging request produces a Grafana-visible trace.
- [ ] Trace context and expected spans verified.
- [ ] Sensitive data exclusion verified.
- [ ] Graceful shutdown flush verified.
- [ ] Sanitized evidence attached to Issue #141.

Until every hosted acceptance item is evidenced, hosted OTLP tracing remains **not accepted** and Issue #141 must remain open.
