# Production Readiness Gates — P0–P9

**Reviewed:** 2026-10-18. Source: user-provided *Checklist hoàn thiện TriAD Backend (lộ trình có cổng kiểm soát)*. Evidence baseline: [main](https://github.com/Thang4869/TriAD-Backend/commit/8a75c0af3c0153e706041c8057e6558a751a2a63).

**Status:** ✅ PASS with evidence; 🟡 PARTIAL / BLOCKED; ⬜ not verified. Passing a CI test does **not** prove staging or production acceptance. A subsequent gate cannot be declared PASS until preceding gates pass, although implementation may proceed in parallel.

| Gate | Status | Evidence already established | Remaining acceptance |
| --- | --- | --- | --- |
| **G0 / P0 — Truth sync** | 🟡 | [README](../README.md) limits production claims; transactional checkout [ADR](adr/0001-transactional-checkout-outbox.md) | Review every claim about COD, Saga, payment, JWT B2/B3, diagrams; independent second review |
| **G1 / P1 — Hygiene** | 🟡 | MIT LICENSE, English README | Confirm SECURITY, CONTRIBUTING, complete .env.example, repository topics, CHANGELOG/tag, clean 5-minute onboarding; [#149](https://github.com/Thang4869/TriAD-Backend/issues/149) |
| **G2 / P2 — Clean Code** | ⬜ | Architecture checking tracked by CI | Baseline `Promise<unknown>`, `any`, `as unknown as`; check Cart.updateItem, Order.total/_placed, payment status enum, Clock, Prisma core imports, singleton tracker/server, empty checkout/domain, DI containers, JSON Zod boundaries, domain errors, single-implementation ports. Full quality suite and no coverage regression |
| **G3 / P3 — OOP and domain** | 🟡 | [#158](https://github.com/Thang4869/TriAD-Backend/pull/158), [#161](https://github.com/Thang4869/TriAD-Backend/pull/161) order transitions and tests | DOMAIN_INVARIANTS.md for Order/Money/Cart/Product with tests, rounding decision, CRUD-vs-aggregate ADR, canTransition proof |
| **G4 / P4 — Reliability** | 🟡 | A1 outbox [#164](https://github.com/Thang4869/TriAD-Backend/pull/164); B7 Redis integration [#193](https://github.com/Thang4869/TriAD-Backend/pull/193) | Lost response / process-kill retries, concurrent price changes, Redis outage metrics, migration with representative old data, matching CI artifacts; [#84](https://github.com/Thang4869/TriAD-Backend/issues/84) |
| **G5 / P5 — Production-like** | 🟡 BLOCKED ON ENVIRONMENT | Image-runtime smoke [#160](https://github.com/Thang4869/TriAD-Backend/pull/160); [recovery runbook](RECOVERY_DRILL.md) | Staging restore/replay/rebuild with **measured** RTO/RPO, dead-letter replay, cleanup, SIGTERM/readiness, HTTPS auth/CSRF/OAuth drill; [#143](https://github.com/Thang4869/TriAD-Backend/issues/143), [#140](https://github.com/Thang4869/TriAD-Backend/issues/140), [#90](https://github.com/Thang4869/TriAD-Backend/issues/90) |
| **G6 / P6 — Load and test strength** | ⬜ | Existing functional CI does not measure this gate | k6 hot-product/checkout p50/p95/p99, throughput/conflicts/resources in LOAD_TEST_REPORT.md; mutation baseline/threshold in CI; [#144](https://github.com/Thang4869/TriAD-Backend/issues/144), [#145](https://github.com/Thang4869/TriAD-Backend/issues/145) |
| **G7 / P7 — Observability** | 🟡 | OpenTelemetry, metrics and alert config | Checkout correlation log→trace→outbox/projection, Grafana dashboards, SLO burn rates and alert-to-runbook links; admin audit log [#147](https://github.com/Thang4869/TriAD-Backend/issues/147) |
| **G8 / P8 — Staging demo** | ⬜ BLOCKED ON ENVIRONMENT | [Frontend](https://github.com/Thang4869/TriAD-12), [operations](OPERATIONS.md) | Publicly reachable HTTPS demo, protected/static OpenAPI, FE login→product→cart→checkout video and proven rollback; [#150](https://github.com/Thang4869/TriAD-Backend/issues/150) |
| **G9 / P9 — Portfolio/CV** | ⬜ | Evidence-first README language | CV numbers from G5/G6 reports, actual test counts, INTERVIEW_QA.md, ten oral answers, final claim audit |

**No complete G0–G9 gate is declared PASS here.** Verified sub-items stay verified; unknown sub-items remain unverified. Environment blockers must not be represented as passed.

## Operating procedure

1. Check phase criteria and capture commit SHA, CI run URL, exact commands, environment, dated redacted logs, reviewer and limitation.
2. Run `npm run typecheck && npm run lint && npm run architecture:check && npm test && npm run build` where scripts are available; use the current CI run for approval.
3. Make small, independently testable changes; avoid mixing code cleanup and behavioral changes.
4. Do not advance a gate without complete acceptance. Keep performance/RTO/RPO/coverage numbers out of public claims without reproducible reports.
5. Resume at [#143 restore](https://github.com/Thang4869/TriAD-Backend/issues/143) → [#140 proxy](https://github.com/Thang4869/TriAD-Backend/issues/140) → [#84 retry](https://github.com/Thang4869/TriAD-Backend/issues/84), then dependency/CSRF, API/DI, load/mutation/audit, demo/CV.

Further evidence and detailed backlog: [Improvement Checklist](TriAD-Backend-Improvement-Checklist.md), [Audit](TriAD-Backend-audit-checklist-updated.md), [Operations](OPERATIONS.md). Final project acceptance requires all gates PASS, green CI, an accessible staging demo, k6/mutation/recovery reports, and docs/CV matching real code; it does not establish a human job title such as “Tech Lead.”
