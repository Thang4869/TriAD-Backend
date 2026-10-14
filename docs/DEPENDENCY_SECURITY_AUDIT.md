# Dependency security audit and remediation plan

**Reviewed:** 2026-10-14
**Scope:** TriAD Backend production and development lockfile dependencies.
**Status:** PARTIAL — upgrades have been generated and committed on draft branch `commit-14102026` through npm itself. Production audit results are recorded below; final Docker/E2E CI and maintainer merge review are pending. Twelve high-severity production findings remain.

## Evidence and commands

The GitHub Actions job **Dependency Audit (report)** runs independently of the application build. It executes:

```powershell
npm audit --omit=dev --json > npm-audit-production.json
npm audit --json > npm-audit-all.json
node scripts/summarize-npm-audit.cjs npm-audit-production.json npm-audit-all.json
```

The job stores both JSON files in a 14-day artifact called
`dependency-audit-report` and emits a direct-dependency/severity summary.
The job reports advisory findings without blocking the build **for now**.
Invalid audit responses should fail the job, rather than be treated as zero
vulnerabilities. Compare production and all-dependency counts separately.
Do not mistake the two numbers for the same exposure risk.

A historical local `npm ci` reported vulnerabilities; the exact current
production dependency count must come from the job's fresh audit artifact.
Never claim a fix solely because `npm ci` succeeds.

## Candidate remediation staged on `commit-14102026` (14/10/2026)

The following were written by **npm on GitHub Actions runner** and committed
as separate staged changes. They are not evidence of a safe deployed build
until full CI, audit and maintainer review complete.

| Stage | Package versions in manifest and lockfile | Intended remediation |
| --- | --- | --- |
| 1 | `proxy-addr@2.0.8` via exact `overrides` | Patch GHSA-jqcg-44mw-7w3h; reject unsafe proxy trust CIDRs at startup |
| 2 | `multer@2.4.0`, `@types/multer@2.3.0` | Address multipart advisories; retain real multipart tests |
| 3 | `bcrypt@6.0.0`, `@types/bcrypt@6.0.0` | Remove legacy `@mapbox/node-pre-gyp`/TAR chain; require native hash regression |

The one-off GitHub Actions lockfile-generation workflow is removed from the
branch after regenerating these manifests. It must not be merged or remain as
a standing write-permission workflow. To reproduce a specific upgrade
locally, use `scripts/b10-upgrade.ps1` and commit the two package files together.
No manual integrity-hash edits, `npm audit fix --force`, or force pushes.

**Acceptance:** `npm ci`, typecheck, lint, architecture check, native bcrypt,
upload multipart, full test/coverage, build, production image smoke and
frontend-to-backend E2E green; inspect the new `Dependency Audit (report)`
artifact for remaining critical/high risks. The report-only job is **not**
a blocking vulnerability gate.

## B10 batch 2 — compatible dependency upgrades (15/10/2026)

On branch `commit-15102026-2`, an npm-capable CI runner generated a
`package-lock.json` update for three **direct dependencies within their
existing semver ranges**. No manual lockfile integrity edits were made.

| Dependency | Locked before | Locked now |
| --- | --- | --- |
| `compression` | 1.8.1 | **1.8.2** |
| `nodemailer` | 9.0.5 | **9.1.1** |
| `sharp` | 0.35.3 | **0.35.5** |

The temporary workflow used solely to regenerate this lockfile has been
removed from the branch. The refreshed GitHub Actions production npm audit (15/10/2026)
reports **0 critical / 10 high / 49 moderate**. The full dependency graph
reports **0 critical / 27 high / 53 moderate**. Compared to the previously
merged baseline, the compatible patch batch removed **2 high findings** in
production and full graphs. `nodemailer` is **still** a direct high finding,
while `compression` and `sharp` are no longer listed as direct high findings.

This batch **requires full unit/integration, build and E2E validation**
and full CI before any claim about high-vulnerability reduction or release
readiness. `cloudinary` and OpenTelemetry still require separate compatibility
decisions; no blind major-version upgrade is attempted.

## Post-upgrade CI audit (14/10/2026)

Artifact: **Dependency Audit (report)** on PR #166, commit `76a0992`.
Version upgrades produced by npm on GitHub Actions runner are reflected
in the checked-in lockfile.

| npm severity | Production after | Full lockfile after |
| --- | ---: | ---: |
| Critical | **0** | **0** |
| High | 12 | 29 |
| Moderate | 49 | 53 |
| Low | 0 | 0 |
| **Total** | **61** | **82** |

This is a measurable improvement, **not** a clean security audit.
The B10 stage adds a CI **blocking critical-only production gate**
(`scripts/assert-production-audit.cjs`) with unit tests. Remaining high
and moderate findings continue to be reported and must be triaged; zero
critical is necessary but not sufficient for release readiness. Remaining
high direct runtime dependencies identified by the npm report include
OpenTelemetry auto-instrumentations/sdk-node, Cloudinary, Compression,
Nodemailer and Sharp. Review their fixed ranges and API compatibility in
separate staged upgrade commits. Do not block necessary releases using
an arbitrary high threshold without an explicit risk review, but do not
call a report-only CI job a security pass either.

## Verified CI baseline (2026-10-13)

Source: GitHub Actions **Dependency Audit (report)** attached to PR #163,
generated from the checked-in npm lockfile. This is evidence of outstanding
vulnerabilities, **not a passed security gate**.

| npm severity | Production (--omit=dev) | Complete lockfile |
| --- | ---: | ---: |
| Critical | 2 | 2 |
| High | 14 | 31 |
| Moderate | 49 | 53 |
| Low | 0 | 0 |
| **Total** | **65** | **86** |

The two critical **transitive** packages in the production report are:

1. `proxy-addr` (GHSA-jqcg-44mw-7w3h), patched in `2.0.8`.
   This can undermine Express `req.ip` when particular IPv4-mapped IPv6
   trust subnets are configured, which directly affects B7 rate limits.
   Prioritize lockfile remediation and verify `TRUST_PROXY` with the real
   reverse-proxy topology. Use plain IPv4 CIDR notation for IPv4 networks
   rather than a short IPv4-mapped IPv6 prefix.
2. `tar` is pulled in transitively through the existing `bcrypt` v5/
   `@mapbox/node-pre-gyp` chain. The npm report recommends
   `bcrypt@6.0.0` (major change), so rerun password hash/compare and
   registration/authentication regression tests after any upgrade.
   The reported `tar` critical score aggregates several archive advisories;
   do not assume the application directly extracts untrusted TAR archives.

Other high-severity **direct** production dependencies in the report include
`@opentelemetry/auto-instrumentations-node`,
`@opentelemetry/sdk-node`, `bcrypt`, `cloudinary`, `compression`,
`nodemailer` and `sharp`. Some require a coordinated major-version
migration; several have fixes within a compatible range. Treat each as a
separate staged change, not an indiscriminate bulk upgrade.

**Note:** The current npm audit JSON did not list `multer` itself as a
vulnerable package, but upstream published advisories confirm issues in the
project's legacy Multer 1.x line. This is why npm audit results must be
cross-checked against package maintainer advisories.

References:
- https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h
- https://github.com/expressjs/multer/security/advisories

### Safe remediation order

1. Fix `proxy-addr` via a compatible lockfile update to `>=2.0.8` and
   validate trusted proxy IP handling.
2. Upgrade Multer to `2.4.0` and `@types/multer` to `2.3.0` with the
   real multipart regression matrix.
3. Upgrade `bcrypt` to `6.0.0` in its own commit, verify password hashes
   stored by v5 can still be checked, and re-audit its `tar` dependency path.
4. Remediate other direct runtime dependencies by available fixed versions,
   preserving compatible OpenTelemetry packages as a coordinated set.

## B10 execution stages (14/10/2026)

**Stage 1 shipped:** `TRUST_PROXY` config validation rejects trust-all,
IPv6 CIDR and IPv4-mapped CIDR values before Express initializes.
`tests/unit/config/trust-proxy.test.ts` exercises raw client headers.
This mitigated an unsafe configuration class before the subsequent npm-generated
`proxy-addr@2.0.8` lockfile upgrade on the same branch.

### Regenerate exact lockfile via npm on a connected machine

Use one stage at a time. The script in `scripts/b10-upgrade.ps1` uses
`npm install --package-lock-only` and then `npm ci` to check lockfile
coherence, runs local quality gates and reports remaining production
advisories. Do not run all stages in one unreviewed diff.

```powershell
cd E:\DNEK-14102026
.\scripts\b10-upgrade.ps1 -Stage proxy-addr
git add -- package.json package-lock.json
git commit -m "fix(deps): pin patched proxy-addr 2.0.8 (B10)"
# Repeat for -Stage multer only after this stage is clean.
# Repeat for -Stage bcrypt after checking the real password regression suite.
```

The script intentionally does **not** commit or push. The maintainer reviews
each stage; do not run `npm audit fix --force` and do not hand-edit the
lockfile's integrity hashes. A successful `npm ci` is a prerequisite, not
proof the advisory is closed. Complete `npm run test:integration`,
production image runtime smoke and FE↔BE E2E before merging.

`tests/unit/shared/utils/bcrypt.native.test.ts` exercises the real native
bcrypt binding and acceptance of legacy `$2a# Dependency security audit and remediation plan

**Reviewed:** 2026-10-13
**Scope:** TriAD Backend production and development lockfile dependencies.
**Status:** PARTIAL — repeatable CI audit reports and multipart regression coverage are added; dependency upgrades remain pending.

## Evidence and commands

The GitHub Actions job **Dependency Audit (report)** runs independently of the application build. It executes:

```powershell
npm audit --omit=dev --json > npm-audit-production.json
npm audit --json > npm-audit-all.json
node scripts/summarize-npm-audit.cjs npm-audit-production.json npm-audit-all.json
```

The job stores both JSON files in a 14-day artifact called
`dependency-audit-report` and emits a direct-dependency/severity summary.
The job reports advisory findings without blocking the build **for now**.
Invalid audit responses should fail the job, rather than be treated as zero
vulnerabilities. Compare production and all-dependency counts separately.
Do not mistake the two numbers for the same exposure risk.

A historical local `npm ci` reported vulnerabilities; the exact current
production dependency count must come from the job's fresh audit artifact.
Never claim a fix solely because `npm ci` succeeds.

## Verified CI baseline (2026-10-13)

Source: GitHub Actions **Dependency Audit (report)** attached to PR #163,
generated from the checked-in npm lockfile. This is evidence of outstanding
vulnerabilities, **not a passed security gate**.

| npm severity | Production (--omit=dev) | Complete lockfile |
| --- | ---: | ---: |
| Critical | 2 | 2 |
| High | 14 | 31 |
| Moderate | 49 | 53 |
| Low | 0 | 0 |
| **Total** | **65** | **86** |

The two critical **transitive** packages in the production report are:

1. `proxy-addr` (GHSA-jqcg-44mw-7w3h), patched in `2.0.8`.
   This can undermine Express `req.ip` when particular IPv4-mapped IPv6
   trust subnets are configured, which directly affects B7 rate limits.
   Prioritize lockfile remediation and verify `TRUST_PROXY` with the real
   reverse-proxy topology. Use plain IPv4 CIDR notation for IPv4 networks
   rather than a short IPv4-mapped IPv6 prefix.
2. `tar` is pulled in transitively through the existing `bcrypt` v5/
   `@mapbox/node-pre-gyp` chain. The npm report recommends
   `bcrypt@6.0.0` (major change), so rerun password hash/compare and
   registration/authentication regression tests after any upgrade.
   The reported `tar` critical score aggregates several archive advisories;
   do not assume the application directly extracts untrusted TAR archives.

Other high-severity **direct** production dependencies in the report include
`@opentelemetry/auto-instrumentations-node`,
`@opentelemetry/sdk-node`, `bcrypt`, `cloudinary`, `compression`,
`nodemailer` and `sharp`. Some require a coordinated major-version
migration; several have fixes within a compatible range. Treat each as a
separate staged change, not an indiscriminate bulk upgrade.

**Note:** The current npm audit JSON did not list `multer` itself as a
vulnerable package, but upstream published advisories confirm issues in the
project's legacy Multer 1.x line. This is why npm audit results must be
cross-checked against package maintainer advisories.

References:
- https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h
- https://github.com/expressjs/multer/security/advisories

### Safe remediation order

1. Fix `proxy-addr` via a compatible lockfile update to `>=2.0.8` and
   validate trusted proxy IP handling.
2. Upgrade Multer to `2.4.0` and `@types/multer` to `2.3.0` with the
   real multipart regression matrix.
3. Upgrade `bcrypt` to `6.0.0` in its own commit, verify password hashes
   stored by v5 can still be checked, and re-audit its `tar` dependency path.
4. Remediate other direct runtime dependencies by available fixed versions,
   preserving compatible OpenTelemetry packages as a coordinated set.

 formatted hashes; keep this
as a regression suite across the v5→v6 migration.

## First remediation target: Multer multipart upload

The original `main` baseline before PR #166 declared Multer 1.4.x. Its 1.x line has
multiple published malformed multipart/stream cleanup denial-of-service
advisories, including GHSA-44fp-w29j-9vj5 and GHSA-fjgf-rc76-4x9p.
The maintained 2.4.0 release includes subsequent security fixes.

Relevant advisories and upstream guidance:

- https://github.com/expressjs/multer/security/advisories
- https://github.com/expressjs/multer/security/advisories/GHSA-44fp-w29j-9vj5
- https://github.com/expressjs/multer/security/advisories/GHSA-fjgf-rc76-4x9p
- https://github.com/expressjs/multer/blob/main/CHANGELOG.md

The image route uses `multer.memoryStorage()`, a single `image` field,
5 MiB file size and zero text fields (the single-file route permits only
one uploaded file).
`validateUploadedImage` performs Sharp metadata checks and a 40M-pixel cap.
Memory storage avoids disk cleanup exposure, but does not negate malformed
multipart/stream processing vulnerabilities.

A targeted upgrade must modify **both** manifests and the exact npm lockfile
using npm itself; updating only `package.json` breaks `npm ci`.
PR #166 now pins `multer@2.4.0` and `@types/multer@2.3.0`.
For future reproduction or review of the upgrade on a clean branch:

```powershell
npm install multer@2.4.0 --save-exact
npm install --save-dev --save-exact @types/multer@2.3.0
npm ci
npx prisma generate
npm run typecheck
npm run lint
npm run architecture:check
npm run test:unit
npm run test:integration
npm run build
npm audit --omit=dev
```

Commit `package.json` and `package-lock.json` together. Re-run CI including
production-image runtime smoke and FE↔BE E2E. Pin and prioritize further
remediations based on the generated report rather than using
`npm audit fix --force`, which can introduce unrelated major version changes.

## Multipart regression matrix

`tests/unit/shared/middlewares/upload.multipart.test.ts` uses real
Express/Supertest/Multer/Sharp instead of mocking Multer. Cases include:

- valid JPEG, PNG and WebP under size limits;
- fake image MIME and unsupported file types;
- a file that exceeds 5 MiB;
- additional multipart text fields;
- image pixel budget and metadata validation unit tests.

The guardrails must remain compatible with the actual admin upload workflow.
A dependency vulnerability cannot be considered closed until the targeted
version is installed from the updated lockfile and this matrix passes.

## Remaining decisions

- Review all direct production packages with critical/high advisories.
- Record the chosen fix version, compatibility evidence and any explicit
  accepted risk in a dated audit note.
- Once the highest-severity production findings are remediated or explicitly
  triaged, set an appropriate **blocking** CI threshold. Avoid a misleading
  unconditional green security badge while the job is report-only.
- Re-scan the production container image and run deployed smoke tests after
  a major dependency upgrade.
