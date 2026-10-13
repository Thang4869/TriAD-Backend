# Dependency security audit and remediation plan

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

## First remediation target: Multer multipart upload

The checked-in `package.json` still declares Multer 1.4.x. Its 1.x line has
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
The current maintained candidate is `multer@2.4.0` with matching
`@types/multer@2.3.0`. Run this upgrade from the active checkout:

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
