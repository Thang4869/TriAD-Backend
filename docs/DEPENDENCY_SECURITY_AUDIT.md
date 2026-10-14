# TriAD Backend — Dependency Security (B10)

**Reviewed:** 2026-10-15 · **Reference:** merged PRs [#166](https://github.com/Thang4869/TriAD-Backend/pull/166), [#170](https://github.com/Thang4869/TriAD-Backend/pull/170), [#172](https://github.com/Thang4869/TriAD-Backend/pull/172), [#173](https://github.com/Thang4869/TriAD-Backend/pull/173).

**Status:** **Production dependency audit clean (main)**: 0 critical/high/moderate; **full graph still 16 high / 5 moderate**. Staging risk review remains OPEN. A passing `npm ci` or audit critical gate does not mean all dependencies are safe.

## Verified production audit snapshots

| CI evidence | Critical | High | Moderate | Full graph high |
| --- | ---: | ---: | ---: | ---: |
| Initial audit, [PR #163](https://github.com/Thang4869/TriAD-Backend/pull/163) | 2 | 14 | 49 | 31 |
| B10 batch 1, [PR #166](https://github.com/Thang4869/TriAD-Backend/pull/166) | **0** | 12 | 49 | 29 |
| B10 batch 2, [PR #170](https://github.com/Thang4869/TriAD-Backend/pull/170) | **0** | **9** | 49 | **26** |
| Cloudinary v2, [PR #172](https://github.com/Thang4869/TriAD-Backend/pull/172) | **0** | **8** | 49 | **25** |
| **main after OpenTelemetry [#173](https://github.com/Thang4869/TriAD-Backend/pull/173)** | **0** | **0** | **0** | **16** |

These are npm advisories in the checked-in lockfile, not independent penetration-test results, and not counts of exploitable routes. Review the production JSON report for actual paths and affected versions.

## Remediation already merged

- `proxy-addr@2.0.8`, `multer@2.4.0`, `bcrypt@6.0.0`: npm-generated manifest/lockfile and regression tests ([#166](https://github.com/Thang4869/TriAD-Backend/pull/166)). Removed legacy `@mapbox/node-pre-gyp`/`tar` path. Proxy trust policy rejects trust-all configuration.
- `compression@1.8.2`, `sharp@0.35.5`, `nodemailer@10.0.16`: targeted batch and native MIME test ([#170](https://github.com/Thang4869/TriAD-Backend/pull/170)).
- `scripts/assert-production-audit.cjs` blocks any critical advisory in the production audit; remaining high/moderate findings must be triaged and cannot be called PASS-security.

## Migrated SDKs — follow-up gates

- **Cloudinary 2.11.0** ([#172](https://github.com/Thang4869/TriAD-Backend/pull/172)): `IImageStorage` preserved, regression tests and Docker/FE↔BE CI passed. Live image upload with real staging credentials still needs proof.
- **OpenTelemetry SDK 2.x** ([#173](https://github.com/Thang4869/TriAD-Backend/pull/173)): coordinated SDK/exporter/resources/auto-instrumentations upgrade, `resourceFromAttributes()`, tracing enabled/disabled startup test. Need live OTLP collector span proof and review of transitive lockfile changes.
- **Full dependency graph:** 16 high / 5 moderate in development/all-dependency audit. Do not call them remediated. Triage package path/reachability, CI/build execution exposure and mitigations before risk acceptance. Do not use `npm audit fix --force`.

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
