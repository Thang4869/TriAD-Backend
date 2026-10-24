# TriAD Backend — Dependency Security (B10)

**Reviewed:** 2026-10-15 · **Reference:** merged PRs [#166](https://github.com/Thang4869/TriAD-Backend/pull/166), [#170](https://github.com/Thang4869/TriAD-Backend/pull/170), [#172](https://github.com/Thang4869/TriAD-Backend/pull/172), [#173](https://github.com/Thang4869/TriAD-Backend/pull/173).

**Current status (re-audited 2026-10-24):** 0 critical, **3 high / 2 moderate** in production; **11 high / 11 moderate** across the full lockfile. Prior 2026-10-15 zero-high production counts below are historical and **no longer current**. Issue #141 is open. CI still enforces zero *critical* production advisories, not zero high/moderate.

## Latest lockfile scan — 2026-10-24

Reproduced by the GitHub Actions **Dependency Audit (critical gate)** job in
[CI run 40082483595](https://github.com/Thang4869/TriAD-Backend/actions/runs/40082483595)
at 2026-10-24 09:35 UTC, checking both `npm audit --omit=dev --json`
and `npm audit --json`. Machine-readable production/full JSON:
[dependency-audit-report artifact](https://github.com/Thang4869/TriAD-Backend/actions/runs/40082483595/artifacts/12556086068).

| Severity | Production | All dependencies |
| --- | ---: | ---: |
| Critical | 0 | 0 |
| High | **3** | **11** |
| Moderate | **2** | **11** |
| Low | 0 | 0 |

The CI summary identifies directly affected production packages: `multer`
(high), `zod` (high), and `nodemailer` (moderate); transitive or additional
entries account for the overall severity totals. Use the archived JSON for
the exact advisory IDs, affected paths, and remediations; an advisory count
is not a count of exploitable application routes.

### Current risk and follow-up

- **Multer `2.4.0` (high):** [GHSA-q7qp-rjg7-q26m](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m)
  affects asynchronous `fileFilter` and is fixed in `2.5.0`.
  Our product image route uses `memoryStorage`, a **synchronous**
  callback filter, a 5 MiB request-file cap, single image, zero text fields
  and Sharp format/pixel checks. The filter's synchronous callback is
  regression-tested. This mitigates the cited async-filter exploit in the
  current route; **upgrade to Multer 2.5.0** and regenerate/verify lockfile
  in a controlled npm run before declaring the advisory resolved.
- **Zod `^3.22.4` (high):** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
  concerns excessive issue accumulation on oversized constrained arrays;
  fixed versions may require a major Zod upgrade. Express JSON/urlencoded
  limits of 100 KiB reduce input size for those routes but do not erase
  the advisory. Inventory array schemas, cap collection lengths and assess
  Zod 4 API/TS compatibility before an upgrade.
- **Nodemailer `10.0.16` (moderate):** October 2026
  [address parser advisories](https://github.com/nodemailer/nodemailer/security/advisories)
  affect recipient interpretation. Assess user-influenced recipient inputs;
  upgrade within 10.x (currently 10.2.0 release) and rerun SMTP sink/email
  job regressions. Do not claim this is fixed by the current version.
- **11 high / 11 moderate in all dependencies:** inspect all lockfile advisory
  paths and group CI/build-only exposures separately. Never accept unreviewed
  build-time advisories by default; CI runners execute dependencies with
  source and workflow privileges. No `npm audit fix --force`, and do not
  manually edit lockfile integrity values.
- **Config B9:** production requires explicit `REDIS_URL`, `FRONTEND_URL`,
  all JWT/TOTP secrets, SMTP/Cloudinary credentials and nonempty `CORS_ORIGIN`.
  Synthetic defaults belong only to `tests/setup-env.ts`.
  `API_EDGE_SECRET` remains optional by policy for direct/local ingress
  modes and is enforced together with `TRUST_PROXY=0` if provided.

**Not yet complete:** regenerate/test a coordinated dependency lockfile
with targeted upgrades, rerun `npm audit` for both scopes, prove staging
Cloudinary real-upload and OTLP collector spans. Keep issue #141 open until
evidence satisfies its acceptance criteria.

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
