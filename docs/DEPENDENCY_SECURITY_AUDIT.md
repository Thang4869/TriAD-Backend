# TriAD Backend — Dependency Security (B10)

**Reviewed:** 2026-10-15 · **Reference:** merged [PR #166](https://github.com/Thang4869/TriAD-Backend/pull/166) and [PR #170](https://github.com/Thang4869/TriAD-Backend/pull/170), new [Draft PR #172](https://github.com/Thang4869/TriAD-Backend/pull/172).

**Status:** **PARTIAL**. CI reports zero production critical vulnerabilities; high advisories remain. A passing `npm ci` or audit critical gate does not mean all dependencies are safe.

## Verified production audit snapshots

| CI evidence | Critical | High | Moderate | Full graph high |
| --- | ---: | ---: | ---: | ---: |
| Initial audit, [PR #163](https://github.com/Thang4869/TriAD-Backend/pull/163) | 2 | 14 | 49 | 31 |
| B10 batch 1, [PR #166](https://github.com/Thang4869/TriAD-Backend/pull/166) | **0** | 12 | 49 | 29 |
| B10 batch 2, [PR #170](https://github.com/Thang4869/TriAD-Backend/pull/170) | **0** | **9** | 49 | **26** |
| Cloudinary v2, [PR #172](https://github.com/Thang4869/TriAD-Backend/pull/172) | **Pending fresh audit** | **Pending** | **Pending** | **Pending** |

These are npm advisories in the checked-in lockfile, not independent penetration-test results, and not counts of exploitable routes. Review the production JSON report for actual paths and affected versions.

## Remediation already merged

- `proxy-addr@2.0.8`, `multer@2.4.0`, `bcrypt@6.0.0`: npm-generated manifest/lockfile and regression tests ([#166](https://github.com/Thang4869/TriAD-Backend/pull/166)). Removed legacy `@mapbox/node-pre-gyp`/`tar` path. Proxy trust policy rejects trust-all configuration.
- `compression@1.8.2`, `sharp@0.35.5`, `nodemailer@10.0.16`: targeted batch and native MIME test ([#170](https://github.com/Thang4869/TriAD-Backend/pull/170)).
- `scripts/assert-production-audit.cjs` blocks any critical advisory in the production audit; remaining high/moderate findings must be triaged and cannot be called PASS-security.

## In review: Cloudinary SDK migration

[Draft PR #172](https://github.com/Thang4869/TriAD-Backend/pull/172) updates `cloudinary` **1.41.3 → 2.11.0** via an npm-generated `package.json` and `package-lock.json`. Versions below 2.7.0 are affected by [GHSA-g4mf-96x5-5m2c](https://github.com/advisories/GHSA-g4mf-96x5-5m2c). `CloudinaryImageStorage` keeps its `IImageStorage` port while rejecting incomplete upload callback responses.

**Before approval:** clean `npm ci`, typecheck, lint, unit/integration, upload_stream regressions, image/runtime smoke, FE↔BE E2E and fresh production `npm audit` high delta. Live Cloudinary credentials/network streaming must be checked separately in staging. The one-time lockfile-generation workflow is **not included in the final PR tree**.

## Remaining B10: coordinated OpenTelemetry migration

`@opentelemetry/auto-instrumentations-node`, `@opentelemetry/sdk-node` and related SDK/exporter/resources/instrumentation packages must be assessed **as a compatible set**. Their old 0.x / 1.x versions predate API/SDK 2.x; a blind single-package upgrade can break tracing initialization. Preserve disabled/enabled tracing startup tests, OTLP exporter setup, spans, graceful `shutdownTracing()`, and Docker smoke.

Security reference: [CVE-2026-44902](https://advisories.gitlab.com/npm/%40opentelemetry/auto-instrumentations-node/CVE-2026-44902/) (Prometheus-exporter crash; affected before 0.75.0). Actual exploitability depends on exporter configuration; the current project exports OTLP HTTP and uses application Prometheus metrics separately, but npm audit must still be evaluated.

## Reproducible evidence

```powershell
npm ci
npm audit --omit=dev --json > npm-audit-production.json
npm audit --json > npm-audit-all.json
node scripts/summarize-npm-audit.cjs npm-audit-production.json npm-audit-all.json
node scripts/assert-production-audit.cjs npm-audit-production.json
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

GitHub Actions uploads JSON reports as artifacts. Audit exits nonzero when vulnerabilities remain; generating JSON does not imply a clean result. Do not manually edit package-lock integrity fields or run `npm audit fix --force`.

**Release approval:** explicitly document the unresolved high findings, paths/reachability, fixed versions, breaking-change cost, mitigating controls, owner and acceptance deadline. Production rollout also needs configured secrets, staging upload and OTLP tracing smoke, and rollback notes.
