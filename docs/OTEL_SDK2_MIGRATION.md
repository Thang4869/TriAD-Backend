# OpenTelemetry SDK 2.x migration — B10

**Review date:** 2026-10-15 · **Draft:** [PR #173](https://github.com/Thang4869/TriAD-Backend/pull/173)

## Scope and implementation

TriAD currently instruments Express and downstream libraries with `@opentelemetry/auto-instrumentations-node`; spans are exported with OTLP HTTP, and `shutdownTracing()` runs during graceful shutdown. Application Prometheus metrics are implemented separately.

| Dependency | Candidate pinned version |
| --- | --- |
| `@opentelemetry/api` | 1.9.1 |
| `@opentelemetry/auto-instrumentations-node` | 0.81.0 |
| `@opentelemetry/core` | 2.12.0 |
| `@opentelemetry/exporter-trace-otlp-http` | 0.223.0 |
| `@opentelemetry/instrumentation-express` | 0.71.0 |
| `@opentelemetry/resources` | 2.12.0 |
| `@opentelemetry/sdk-node` | 0.223.0 |
| `@opentelemetry/semantic-conventions` | 1.43.0 |

The `Resource` class is no longer exported by SDK 2.x. `src/core/tracing/tracing-resource.ts` uses `resourceFromAttributes()` instead, preserving `service.name` and `service.version`. `tests/unit/core/tracing/tracing-startup.test.ts` smoke-tests `ENABLE_TRACING=true/false` in isolated Node subprocesses, including SDK shutdown. These tests **do not prove that traces arrive at a live collector**.

## Lockfile and dependency risk

The initial npm update encountered `ERESOLVE` on the previous OTel 0.5x peer graph. The first clean re-resolution encountered an npm Arborist `edgesOut` error. npm 11 successfully produced a coherent `package-lock.json` from the fully pinned manifest **without** `--force` or `--legacy-peer-deps`. The one-time write-capable generation workflow has been removed from the final PR tree.

Because a full lockfile regeneration was required, npm updated transitive packages beyond OpenTelemetry (roughly 70 package updates, 972 → 919 lock entries in the generator's report). Review the entire diff and verify that key unrelated direct dependencies remain unchanged. CI must prove that `npm ci` on the standard Node 22 runner accepts the generated lockfile.

## Evidence and release gate

The candidate audit on PR #173, *before Cloudinary PR #172 is merged*, reports:

| Severity | Production | Full dependency graph |
| --- | ---: | ---: |
| Critical | **0** | **0** |
| High | **1** (Cloudinary) | **17** |
| Moderate | **0** | **5** |

This is an audit of **PR #173 in isolation**, not a measured combined result of PR #172 + #173. Cloudinary remains old on PR #173 because each PR was branched independently from `main`. Do **not** claim zero high until the merged dependency graph is actually audited.

**Required before merge:** standard CI typecheck/lint, unit/integration, tracing startup/shutdown smoke, production Docker runtime smoke, FE↔BE E2E, tracing enabled with a real OTLP collector, propagated trace IDs and sample spans in staging. Verify default tracing-disabled behavior remains safe. Confirm deployment Node version and establish a rollback plan; no live collector or performance claim exists yet.

Official references: [OpenTelemetry JS SDK 2.x migration](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md) and [CVE-2026-44902 advisory](https://advisories.gitlab.com/npm/%40opentelemetry/auto-instrumentations-node/CVE-2026-44902/).
