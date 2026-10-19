# Changelog

Notable user-visible and engineering changes are recorded here. The project uses [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) sections and [Semantic Versioning](https://semver.org/) for **published** releases. This file is not evidence that a release tag exists.

## [Unreleased]

### Added
- Evidence-based P0–P9 [remaining work checklist](docs/TriAD-Backend-Improvement-Checklist.md) and documentation of domain invariants.
- Regression tests for invalid Product and Cart quantities.

### Changed
- Product stock and Cart item quantity commands reject fractional, non-finite, and unsafe integer values, including overflow.

## Release procedure

1. Confirm exact release commit and green CI; finish the relevant readiness gates.
2. Summarize changes under Added/Changed/Fixed/Security, with referenced issue/PR numbers.
3. Review migrations, compatibility, rollback and deployment configuration in [Operations](docs/OPERATIONS.md).
4. Create a version tag only after review and deploy checks. Never publish or imply `v1.0.0` solely to satisfy a checklist.
5. Record the release date, signed-off SHA and GitHub Release link in this changelog.

**Status:** No historical release versions are asserted until verified against actual Git tags.
