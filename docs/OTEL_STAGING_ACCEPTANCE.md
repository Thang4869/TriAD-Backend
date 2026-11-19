# OpenTelemetry staging acceptance

**Status:** blocked pending an approved, reachable hosted OTLP receiver.  
**Last checked:** 2026-11-20  
**Related:** Issue #141 (B10 / hosted tracing evidence)

## Current verified state

- `src/core/tracing/tracing.ts` initializes the OpenTelemetry NodeSDK only when `ENABLE_TRACING=true`.
- The default exporter endpoint is `http://localhost:4318/v1/traces`. This is a local default, not a valid hosted Render collector address.
- `.env.example` intentionally keeps `ENABLE_TRACING=false` and says to configure an actual collector before enabling.
- `render.yaml` explicitly sets `ENABLE_TRACING=false` for `triad-api-staging`.
- The Render workspace currently contains `triad-api-staging` and `vah-backend`; no dedicated collector service is present.
- Render application logs queried on 2026-11-20 contain repeated `OpenTelemetry tracing disabled` messages, including entries from 2026-11-19.
- `docker-compose.prod.yml` defines a local Compose collector at `otel-collector:4318`, with a debug exporter. That is a separate Compose topology and is not a hosted Render receiver. Its debug exporter is useful for local acceptance, not proof of hosted trace retention or querying.
- `tests/unit/core/tracing/tracing-startup.test.ts` verifies SDK startup/shutdown only. It does not prove end-to-end OTLP delivery.

## Safety decision

**Do not enable tracing on Render yet.** Do not set the endpoint to `localhost`, the Compose-only hostname `otel-collector`, or an unverified URL. Do not change Render environment variables or trigger a deployment as part of this blocked acceptance.

The current SDK setup configures only the exporter URL. Before selecting a hosted receiver, determine whether it requires authentication headers or other exporter options. Never place credentials in the endpoint URL or in application logs. If the provider requires headers, implement a separately reviewed secret-backed configuration path and test that secrets are not logged.

## Required work before enabling staging tracing

1. Select an OTLP/HTTP receiver compatible with the free-demo budget and Singapore-region connectivity; confirm its current free-tier limits, retention, authentication method, and data handling directly with the provider.
2. Obtain the HTTPS OTLP traces endpoint and required authentication mechanism. Keep credentials in the hosting secret store; never commit them.
3. Review exporter configuration support. Add authentication-header support only if required, with strict validation and redaction tests. Keep tracing disabled by default.
4. Confirm the receiver is reachable from the Render service without exposing an unauthenticated public collector.
5. Configure only the staging service after explicit owner approval. Preserve every existing environment variable; do not replace the full environment.
6. Deploy deliberately and verify startup reports tracing enabled without printing secrets.
7. Send a controlled synthetic request through the staging API. Verify a trace with the expected `service.name=triad-backend`, a non-empty trace ID, and relevant HTTP/server spans is visible at the receiver.
8. Verify trace context propagation across the request path and ensure no credentials, authorization headers, cookies, passwords, tokens, or sensitive request bodies appear in span attributes.
9. Verify graceful shutdown flushes spans, and confirm receiver-side timestamps and service identity.
10. Record sanitized evidence (provider/plan, endpoint hostname only, deployment ID, test time, trace ID, span names, and acceptance result). Never publish the full endpoint if it contains credentials, or any auth header/token.
11. If any check fails, disable tracing again and verify the application remains healthy. Do not claim OTLP acceptance based solely on a successful API response or SDK startup log.

## Acceptance checklist

- [ ] Hosted OTLP receiver selected and free-demo limits reviewed.
- [ ] Receiver endpoint and authentication requirements verified.
- [ ] Any required exporter auth support reviewed, implemented, and tested without secret leakage.
- [ ] Owner explicitly approves staging environment changes.
- [ ] Staging tracing enabled with a verified HTTPS endpoint.
- [ ] Synthetic staging request produces a receiver-visible trace.
- [ ] Trace context and expected spans verified.
- [ ] Sensitive data exclusion verified.
- [ ] Graceful shutdown flush verified.
- [ ] Sanitized evidence attached to Issue #141.

Until every item is evidenced, hosted OTLP tracing remains **not accepted** and Issue #141 must remain open.
