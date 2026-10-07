# TriAD-Backend — Improvement Checklist

**Cập nhật:** 08/10/2026  
**Baseline:** `main` tại `25ba2a` sau khi thêm `docs/THREAT_MODEL.md`.  
**Mục tiêu của bản rút gọn:** chỉ giữ **OPEN / PARTIAL / CONDITIONAL**. Các mục CLOSED đã được gom vào một baseline ngắn ở cuối file.

## Quy ước

| Trạng thái     | Ý nghĩa                                                           |
| -------------- | ----------------------------------------------------------------- |
| ⬜ NEXT        | Ưu tiên làm ngay.                                                 |
| ⬜ OPEN        | Gap còn thực sự tồn tại.                                          |
| 🟡 PARTIAL     | Đã có phần lớn implementation/evidence nhưng chưa đóng hoàn toàn. |
| 🟡 PENDING     | Chờ environment/provider thật để xác minh.                        |
| ⚪ CONDITIONAL | Chỉ làm nếu use case/scale/business semantics cần.                |

## P0 — Correctness, durable side effects & security

| Mã  | Việc còn lại                                                                                                                                                                                   | Evidence chính                                                                                                                                                               | Trạng thái |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1  | Phân loại các event còn direct publish. Chỉ event có durable side effect/cần sống qua crash mới đưa qua outbox. Với Auth/Reviews phải ghi rõ side effect, idempotency key và failure policy.   | `src/modules/auth/auth.service.ts`, `src/modules/reviews/reviews.service.ts`, `src/core/outbox/persist-domain-events.ts`                                                     | ⬜ NEXT    |
| A8  | Chốt read-after-write consistency cho Orders. Checkout trả write result trực tiếp nhưng order/history đọc projection; document SLA hoặc fallback có chủ đích nếu UX cần read-your-writes.      | `src/modules/checkout/checkout.service.ts`, `src/modules/orders/orders.service.ts`, `src/modules/orders/infrastructure/repositories/prisma-order-history-read.repository.ts` | ⬜ OPEN    |
| B2  | Access-token revocation không nên dùng whole JWT làm Redis key. Dùng `jti` hoặc hash ngắn; quyết định fail-open/fail-closed khi Redis lỗi và có logging/metric.                                | `src/modules/auth/services/token.service.ts`, `src/shared/constants/security.constant.ts`                                                                                    | ⬜ OPEN    |
| B3  | Chuẩn hóa JWT claims theo token class: `jti`, `iss`, `aud`, purpose/type; verify đúng loại token thay vì chỉ signature/expiry.                                                                 | `src/modules/auth/services/token.service.ts`, `src/shared/utils/jwt.ts`, access-token verifier port                                                                          | ⬜ OPEN    |
| B6  | `THREAT_MODEL.md` đã tồn tại. Đồng bộ quyết định CSRF với threat model: giữ random double-submit hiện tại hay dùng signed/HMAC session-bound token; chỉ đổi khi threat model/evidence yêu cầu. | `docs/THREAT_MODEL.md`, `src/shared/middlewares/csrf.middleware.ts`, FE `src/shared/utils/csrf.js`                                                                           | ⬜ OPEN    |
| B7  | Rà rate-limit policy: keying, lockout/bypass risk, Redis failure mode và health-route assumptions.                                                                                             | `src/shared/middlewares/rate-limit.middleware.ts`, `src/modules/auth/auth.routes.ts`                                                                                         | ⬜ OPEN    |
| B9  | Chuyển test-only fallback secrets khỏi production config module sang test setup/env.                                                                                                           | `src/config/index.ts`, `tests/setup.ts`                                                                                                                                      | ⬜ OPEN    |
| B10 | Chạy `npm audit` ở thời điểm nâng dependency; xử lý `multer`/dependency advisory dựa trên kết quả thực tế và chạy upload regression tests.                                                     | `package.json`, `src/shared/middlewares/upload.middleware.ts`                                                                                                                | ⬜ OPEN    |

## P1 — Architecture boundaries, DI & lifecycle

| Mã  | Việc còn lại                                                                                                                                                                        | Evidence chính                                                     | Trạng thái     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------- |
| D2 | Application/Saga observability đã được tách khỏi concrete infrastructure. `TracerPort` và `MetricsPort` định nghĩa application boundary; OpenTelemetry và Prometheus được bọc qua adapters và wire tại composition root. `CheckoutService`, `StockReservationService`, `CheckoutSaga` và `CancellationRefundSaga` không còn import trực tiếp `@core/tracing`, `@core/metrics`, `@opentelemetry` hoặc `prom-client`. Unit/integration tests sử dụng observability test doubles. Typecheck, architecture check, targeted tests, adapter tests, lint, build và full regression đều PASS. | `src/shared/application/observability/*`, `src/core/observability/*`, `src/modules/checkout/checkout.service.ts`, `src/modules/checkout/services/stock-reservation.service.ts`, `src/modules/checkout/application/checkout.saga.ts`, `src/modules/orders/application/cancellation-refund.saga.ts`, `src/core/di/tokens.ts`, `src/container.ts`, `tests/helpers/observability.ts`, `tests/unit/core/observability/*` | ✅ CLOSED |
| D3  | Prisma repositories dùng singleton Prisma client trực tiếp. Chỉ inject client/transaction-capable adapter nếu testability/lifecycle thực sự cần; không coi đây là blocker mặc định. | `src/core/database/prisma.ts`, Prisma repositories                 | ⚪ CONDITIONAL |
| D5  | Không thêm interface cho mọi class. Chỉ thêm port ở module/external boundary hoặc nơi có nhiều implementation/test seam rõ.                                                         | composition root/controllers/services                              | ⚪ CONDITIONAL |
| D6  | Tách composition root theo module để giảm import-time coupling; đưa health dependency construction về composition root nếu hợp lý.                                                  | `src/container.ts`, `src/core/health/health.routes.ts`             | ⬜ OPEN        |
| D7  | `AuthRepository` và `AuthSessionUser` đang có thể tạo hai `PrismaAuthRepository`; hợp nhất shared singleton nếu muốn lifecycle/identity rõ.                                         | `src/container.ts`                                                 | ⬜ OPEN        |
| D8  | `requestScope(rootContainer)` đã mount nhưng chưa có registration `Lifetime.Scoped`. Hoặc thêm dependency scoped thật, hoặc bỏ middleware/abstraction chưa dùng.                    | `src/app.ts`, `src/core/di/container.ts`, request-scope middleware | ⬜ OPEN        |
| F1  | Production-wire Checkout/Cancellation Saga chỉ khi payment/refund adapter thật hoặc demo adapter có semantics rõ; phải có resume/retry/compensation/idempotency tests.              | checkout/cancellation-refund Saga, `docs/OPERATIONS.md`            | ⚪ CONDITIONAL |

## P2 — Domain model & OOP cleanup

| Mã  | Việc còn lại                                                                                                                                                                                    | Trạng thái     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| G2  | `Money` đã khá hoàn thiện; chỉ thêm `equals/zero/sum/allocate` khi có use case. Thay generic `Error` bằng domain error nơi phù hợp; document VND-only nếu đó là scope thật.                     | 🟡 PARTIAL     |
| G3  | `PaymentMethod`/`PaymentStatus` đã typed hơn nhưng order/payment lifecycle chưa hoàn chỉnh vì settlement provider chưa production-wire. Hoàn thiện cùng payment use case thật, không model giả. | 🟡 PARTIAL     |
| G5  | Đưa order transition table thành `static readonly`; chỉ dùng State pattern nếu behavior theo state đủ phức tạp.                                                                                 | ⬜ OPEN        |
| G6  | Loại hoặc định nghĩa rõ `_placed` vì dễ trùng semantics với persisted/hydrated state.                                                                                                           | ⬜ OPEN        |
| G10 | Strategy chỉ dùng khi pricing/payment thực sự có policy biến đổi; không duy trì pattern chỉ để làm đẹp README.                                                                                  | ⬜ OPEN        |
| G11 | Inject `Clock`/`IdGenerator` ở path có business-time/determinism thực sự cần, không thay mọi `new Date()`/UUID trong infrastructure.                                                            | ⬜ OPEN        |
| G12 | Giữ mapper/aggregate mapping ở module có invariant thật; projection/CRUD read model có thể trả DTO. Loại unsafe cast tại boundary.                                                              | ⬜ OPEN        |
| G13 | Chốt scope `Address`: free-form có document rõ hoặc structured address khi use case thật cần.                                                                                                   | ⬜ OPEN        |
| G14 | Không ép Reviews/Wishlist/Notifications thành aggregate/domain-heavy nếu không có invariant đáng kể.                                                                                            | ⚪ CONDITIONAL |
| G15 | Chia application service lớn khi responsibility/use case đã tách rõ; tránh split chỉ theo số dòng.                                                                                              | ⬜ OPEN        |
| G16 | Cân nhắc application-facing EventBus port/typed event map để giảm coupling nếu event surface tiếp tục tăng.                                                                                     | ⬜ OPEN        |

## P3 — Clean Code, API shape & toolchain

| Mã  | Việc còn lại                                                                                                                                                                | Trạng thái |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| H2  | Rà duplicate order list/detail surface giữa checkout/orders; giữ một ownership/API boundary rõ.                                                                             | ⬜ OPEN    |
| H4  | Chuẩn hóa naming convention cho ports/repositories/services và suffixes đang không đồng nhất.                                                                               | ⬜ OPEN    |
| H5  | Giảm trộn tiếng Việt/Anh trong code comments/docs; chọn convention theo loại tài liệu.                                                                                      | ⬜ OPEN    |
| H7  | Phân loại remaining casts và `console.*`; thay unsafe cast bằng parser/narrowing và runtime logs bằng structured logger nơi phù hợp.                                        | ⬜ OPEN    |
| H8  | Bật thêm TypeScript strict flags từng bước (`noUncheckedIndexedAccess`, `noImplicitOverride`, unused flags, `exactOptionalPropertyTypes`) chỉ khi baseline có thể fix sạch. | ⬜ OPEN    |
| H10 | Nếu composition root/tokens/error catalog tiếp tục lớn, chia theo bounded context để tăng ownership/reviewability.                                                          | ⬜ OPEN    |
| H11 | Nâng ESLint/TypeScript tooling có kiểm soát; thêm rules giá trị cao như no-floating-promises/cycles/no-explicit-any sau khi baseline sạch.                                  | ⬜ OPEN    |
| H12 | Dependency hygiene đã xử lý phần lớn; rà các package/type package còn lại trước khi đóng hoàn toàn.                                                                         | 🟡 PARTIAL |
| H13 | Chạy `npm ls`/`depcheck` và đối chiếu import thực tế trước khi xóa dependency.                                                                                              | ⬜ OPEN    |

## P4 — Testing & quality evidence

| Mã  | Việc còn lại                                                                                                                                                         | Trạng thái     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| T1  | Backend-side API E2E bằng `supertest` cho business flow chỉ cần thêm nếu muốn evidence ở HTTP boundary độc lập với browser E2E. Full FE↔BE Playwright journey đã có. | ⚪ CONDITIONAL |
| T2  | Integration matrix đã mạnh. Còn synchronized price-change-vs-checkout và lost-response HTTP retry/business scenario.                                                 | 🟡 PARTIAL     |
| T3  | Mở rộng OpenAPI contract test từ path existence sang request/response schemas/critical examples; cân nhắc generate spec từ Zod nếu giảm drift.                       | ⬜ OPEN        |
| T4  | Thêm mutation testing cho domain/value objects/core services; lưu report và threshold thực tế.                                                                       | ⬜ OPEN        |
| T6  | Nâng chaos test thành kill relay/process, crash window hoặc DB disconnect thật trong test environment.                                                               | ⬜ OPEN        |
| T7  | Thêm k6 load test cho checkout/hot product; lưu p50/p95/p99, throughput, error/conflict rate và environment.                                                         | ⬜ OPEN        |
| T8  | Dùng test data builders/fakes ở các suite có mock setup dài/lặp; không thay mock đơn giản bằng abstraction nặng hơn.                                                 | ⬜ OPEN        |

## P5 — Packaging, CI/CD & production operations

| Mã  | Việc còn lại                                                                                                                                                              | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| I2  | Production packaging đã tốt; còn resource policy, unused volume cleanup và cách orchestration `prisma migrate deploy` rõ ràng hơn.                                        | 🟡 PARTIAL |
| I4  | Dockerfile đã multi-stage/non-root/healthcheck. Supply-chain hardening như pin digest/SBOM/scanning là bước tăng cường, không phải blocker.                               | 🟡 PARTIAL |
| I6  | Graceful shutdown đã có; thêm readiness-draining state trả 503 trước teardown và SIGTERM integration/runtime test.                                                        | 🟡 PARTIAL |
| I7  | CI đã build Docker và full-stack journey. Còn runtime smoke **image vừa build**, dependency/security scan policy, migration/schema drift gate và release checks.          | 🟡 PARTIAL |
| I8  | Khi readiness đủ, thêm release discipline: tag/semver, `CHANGELOG.md`, branch protection/release notes phù hợp.                                                           | ⬜ OPEN    |
| I9  | Document/tune Prisma pool/timeouts, backup/restore, Redis `noeviction` cho queue và recovery drill; cân nhắc tách queue Redis khỏi cache/rate-limit khi tải thật yêu cầu. | ⬜ OPEN    |
| I10 | Đồng bộ `.env.example` với SMTP/Cloudinary/OAuth/operational keys và document secret injection; không commit secret thật.                                                 | ⬜ OPEN    |

## P6 — Observability, security operations & API

| Mã  | Việc còn lại                                                                                                              | Trạng thái |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| J1  | Gắn `trace_id`/`span_id` ổn định vào structured request/application logs.                                                 | 🟡 PARTIAL |
| J2  | Nếu muốn production-operability evidence mạnh: Grafana dashboard, SLO/burn-rate và runbook links trong alert annotations. | ⬜ OPEN    |
| J3  | Audit log cho admin actions nhạy cảm: actor, target, timestamp, correlation ID và outcome.                                | ⬜ OPEN    |
| J4  | Document stable error codes. API versioning/cursor pagination chỉ thêm khi compatibility/scale thật sự cần.               | ⬜ OPEN    |

- ✅ Observability boundary: application services và Sagas chỉ phụ thuộc `TracerPort` / `MetricsPort`; OpenTelemetry/Prometheus adapters được compose tại DI root.
- ✅ Không còn direct import `@core/tracing`, `@core/metrics`, `@opentelemetry` hoặc `prom-client` trong `src/modules`.
- ✅ Observability adapters có unit tests riêng.

## P7 — Documentation & portfolio

| Mã  | Việc còn lại                                                                                                                                                                        | Trạng thái |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| K2  | Nếu dùng ADR nghiêm túc, tách `docs/adr/0001-...md` với Status/Context/Decision/Consequences; tránh nhân đôi quyết định giữa README và ARCHITECTURE.                                | ⬜ OPEN    |
| K3  | Bổ sung repo metadata/topics, architecture image, curl examples, frontend link, `SECURITY.md`, `CONTRIBUTING.md` và license phù hợp. `THREAT_MODEL.md` đã có, không tạo task trùng. | ⬜ OPEN    |
| K4  | Deploy/demo thật hoặc cung cấp protected/staging/static OpenAPI artifact. Không mở `/api/docs` production chỉ để demo.                                                              | ⬜ OPEN    |
| K5  | CV chỉ dùng metrics tái lập được: CI coverage/test evidence, k6 result, mutation score, concurrency/recovery scenario. Không dùng điểm AI như KPI.                                  | ⬜ OPEN    |

## Completed baseline — đã xóa khỏi active backlog

Các nhóm sau đã có implementation/evidence đủ mạnh và không nên tiếp tục chiếm diện tích checklist bằng từng dòng CLOSED:

- Checkout correctness: transaction boundary, price snapshot, stock, order persistence, retry/contention.
- Idempotency: Redis + DB uniqueness/recovery path.
- Order aggregate/status transitions + optimistic concurrency + transactional outbox.
- CQRS production wiring cho product/order/dashboard projections.
- Outbox relay leases/retry/dead-letter/replay/retention/indexes/handler tracker.
- **C8:** versioned/validated outbox event envelope (`schemaVersion`, Zod, legacy-as-v1, malformed/unsupported failure path).
- Error taxonomy/HTTP boundary và persistence error mapping.
- CSRF bootstrap, production route protection, request-size limit, image content validation.
- OAuth provider identity/state hardening ở code level.
- `dependency-cruiser` architecture boundary gate trong CI.
- Unit coverage gates + integration/concurrency/projection tests.
- Full FE↔BE Playwright journey trong GitHub Actions.
- README correction: production checkout là transaction-based; Saga/payment chưa production-wire; `/api/docs` không public production.
- `docs/THREAT_MODEL.md` đã được thêm.

## Current priority queue

1. **A1** — durable side-effect classification.
2. **B2 + B3** — JWT/revocation hardening.
3. **I7** — production image runtime smoke in CI.
4. **T6 + T2** — real crash/kill-process and lost-response/concurrent price scenarios.
5. **I9** — backup/restore + outbox/projection recovery drill.
6. **T7** — k6 performance evidence.
7. **T4** — mutation testing.
8. **D6 + D8 + H10** — composition root/lifecycle cleanup.
9. **J3** — admin audit logging.
10. **I8 + K3 + K4 + K5** — release/repo/demo/CV evidence.

## Không nên làm chỉ để tăng “điểm OOP”

- Không thêm pattern nếu không giải quyết branching/coupling/recovery thực.
- Không tạo port/interface cho mọi class.
- Không ép CRUD module thành aggregate.
- Không ép mọi event nội bộ vào outbox; chỉ durable post-commit side effects cần persistence/retry.
- Không production-wire Saga trước khi payment/refund semantics tồn tại.
- Không xem số lượng checkbox CLOSED là bằng chứng “Tech Lead” hoặc “10/10”.

> **NEXT:** `A1` — phân loại event của Auth/Reviews theo durability, side effect, idempotency và crash semantics.
