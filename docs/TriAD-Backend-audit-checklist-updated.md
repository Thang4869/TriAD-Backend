# Checklist hoàn thiện TriAD Backend và kết nối Frontend

**Cập nhật:** 10/10/2026  
**Mốc đối chiếu:** `main` tại `25ba2a` là baseline cũ; cập nhật D6/D7 dựa trên bản export backend local ngày 09/10/2026 (các thay đổi chưa commit). Frontend `Thang4869/TriAD-12` vẫn là cơ sở đối chiếu FE↔BE.  
**Mục đích:** chỉ giữ **evidence nền tảng** và các **gap còn cần xử lý**. Các mục đã đóng lâu không còn được liệt kê từng dòng.

> Checklist này không phải thang điểm tuyệt đối. Mục tiêu là làm cho claim về OOP, Clean Code, production readiness và portfolio có bằng chứng tái lập được.

## Quy ước

| Trạng thái     | Ý nghĩa                                                          |
| -------------- | ---------------------------------------------------------------- |
| ✅ BASELINE    | Đã hoàn thành, chỉ giữ summary để làm mốc.                       |
| 🟡 PARTIAL     | Đã có implementation/evidence nhưng còn gap cụ thể.              |
| 🟡 PENDING     | Code đã sẵn sàng nhưng cần môi trường/provider thật để xác minh. |
| ⬜ OPEN        | Chưa hoàn tất hoặc chưa có đủ evidence.                          |
| ⬜ NEXT        | Ưu tiên thực hiện ngay tiếp theo.                                |
| ⚪ CONDITIONAL | Chỉ làm khi use case/business/runtime thực sự cần.               |

## 1. Snapshot đánh giá hiện tại

| Mảng                      |    Đánh giá | Nhận định                                                                                                                                  |
| ------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OOP / SOLID / DDD         |     ~9.3/10 | Aggregate, value object, ports/adapters, DI, specification, state transition, UoW và event-driven boundaries đã mạnh.                      |
| Architecture              |     ~9.4/10 | Modular monolith, dependency boundary gate và composition root tách module; request-scope lifecycle (D8) vẫn chưa chốt.                    |
| Clean Code                |     ~9.0/10 | `src/container.ts` gọn hơn; event wiring và health-route construction được tách; cast/tooling/naming cleanup vẫn còn.                      |
| Testing / CI              |     ~9.4/10 | Coverage gate, architecture gate, integration tests, Docker build và full FE↔BE journey đã có.                                             |
| Reliability / concurrency |     ~9.3/10 | Transactional outbox, lease/retry/dead-letter, idempotency, optimistic concurrency và projection ordering đã có.                           |
| Security                  |     ~8.8/10 | CSRF, OAuth state, rate limiting, hidden production routes, upload validation và threat model đã có; JWT/Redis policies còn cần hardening. |
| Production readiness      |     ~8.7/10 | Local production stack và CI build tốt; thiếu runtime image smoke, recovery drill và deployed evidence đầy đủ.                             |
| Observability / Ops       |     ~9.0/10 | OTEL, metrics, alerts, structured logging foundation và runbooks đã có; còn SLO/dashboard/audit logging.                                   |
| **Tổng thể Backend**      | **~9.2/10** | Đủ mạnh để đưa vào CV/portfolio; chưa nên tự nhận “10/10” hoặc “production-ready tuyệt đối”.                                               |

## 2. Completed baseline — chỉ giữ mốc, không mở lại thành task

| Nhóm                    | Evidence hiện có                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transaction correctness | Checkout transaction boundary, locked product snapshot, stock update, order persistence và outbox cùng transaction; retry cho serialization/contention.                           |
| Idempotency             | Redis middleware + DB uniqueness theo user; retry cùng checkout attempt có thể recover persisted order.                                                                           |
| Orders/domain           | Order aggregate, typed transitions, optimistic version và transactional domain events.                                                                                            |
| CQRS                    | Product catalog, order history và dashboard read models đã được production-wire; projection ordering/rebuild có test/script.                                                      |
| Outbox                  | Relay leases, heartbeat, stale-owner protection, retry/backoff, handler tracker, dead-letter replay, retention cleanup và maintenance indexes.                                    |
| Outbox schema           | `schemaVersion: 1`, Zod validation, legacy-as-v1 và invalid/unsupported payload đi vào failure/retry path. **C8 đã đóng.**                                                        |
| Architecture            | Custom DI container, ports/adapters và `dependency-cruiser` boundary enforcement trong CI; negative probe đã chứng minh rule hoạt động.                                           |
| Composition root (D6)   | Registrations tách qua `src/composition/register-*.ts`; event handlers và 14 subscriptions được wire riêng, có test chống đăng ký trùng; HealthService được compose ngoài routes. |
| Auth DI identity (D7)   | `registerAuthModule()` dùng một `PrismaAuthRepository` cho `TOKENS.AuthRepository` và `TOKENS.AuthSessionUser`; không khởi tạo trùng adapter.                                     |
| Security foundation     | CSRF bootstrap, CORS/cookie handling, OAuth state store, upload content validation, request size limits, `/metrics` và `/api/docs` không mount ở production.                      |
| Threat modeling         | `docs/THREAT_MODEL.md` đã được thêm để ghi trust boundaries, attack surface, mitigations và residual risks.                                                                       |
| Testing                 | Global unit coverage threshold ~90%; domain/value-object target 100%; PostgreSQL/Redis integration tests; concurrency/retry/projection tests.                                     |
| Full-stack evidence     | GitHub Actions đã chạy flow login → product → cart → checkout → persisted order giữa frontend và backend.                                                                         |
| Runtime foundation      | Docker multi-stage/non-root, production Compose, Postgres, Redis, BullMQ, OTEL collector, health endpoints và graceful shutdown cơ bản.                                           |
| Documentation           | README đã giảm over-claim: Saga/payment chưa production-wire, production checkout là transaction-based, docs production được bảo vệ.                                              |

## 3. Active audit gates

Các dòng dưới đây là phần cần tiếp tục cập nhật. Chi tiết kỹ thuật nằm trong `docs/TriAD-Backend-Improvement-Checklist.md`.

| Ưu tiên     | Gate                                           | Liên kết backlog      | Trạng thái     | Điều kiện đóng                                                                                                                       |
| ----------- | ---------------------------------------------- | --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P0          | Durable side-effect classification             | A1                    | ⬜ NEXT        | Phân loại Auth/Review events; event cần sống qua crash phải có durable path + idempotency/failure policy.                            |
| P0          | Access-token/JWT semantics                     | B2, B3                | ⬜ OPEN        | Dùng `jti`/hash thay whole JWT cho revocation key; claim set có `iss`/`aud`/type/`jti` và verify theo token class.                   |
| P0          | Redis/security failure policy                  | B2, B7                | ⬜ OPEN        | Fail-open/fail-closed được quyết định, log/metric rõ, test được.                                                                     |
| P0          | Production image runtime smoke                 | I7 / audit #32        | 🟡 PARTIAL     | CI migrate → start image vừa build → `/health/ready` → API request đại diện → SIGTERM clean.                                         |
| P0          | Crash/recovery evidence                        | T2, T6 / audit #30    | 🟡 PARTIAL     | Lost-response retry, synchronized price-change-vs-checkout và kill-process/crash-window test có evidence.                            |
| P0          | Backup/restore drill                           | I9 / audit #33        | ⬜ OPEN        | Restore DB, replay outbox, rebuild projection; ghi RTO/RPO và runbook kết quả.                                                       |
| P1          | Mutation testing                               | T4                    | ⬜ OPEN        | Mutation report cho domain/value objects/core services với threshold hợp lý trong CI hoặc artifact tái lập.                          |
| P1          | Load/performance evidence                      | T7                    | ⬜ OPEN        | k6 scenario cho checkout/hot product; ghi p50/p95/p99, throughput, error/conflict rate và test environment.                          |
| P1          | DI request-scope lifecycle / future modularity | D8, H10               | ⬜ OPEN        | Quyết định có cần `Lifetime.Scoped`/requestScope hay loại bỏ middleware; chỉ chia tiếp tokens/composition khi ownership thực sự cần. |
| P1          | Observability production proof                 | J1, J2                | 🟡 PARTIAL     | trace/span correlation ổn định; dashboard/SLO/burn-rate/runbook links nếu muốn claim operability mạnh.                               |
| P1          | Admin audit trail                              | J3                    | ⬜ OPEN        | Sensitive admin actions có actor, target, time, correlation ID, outcome.                                                             |
| P2          | Deployed auth/CSRF/OAuth smoke                 | audit #12/#23         | 🟡 PENDING     | Chạy trên domain thật: login, refresh, logout, CSRF và OAuth callback với provider thật.                                             |
| P2          | Release/repository hygiene                     | I8, K3, issue hygiene | ⬜ OPEN        | Tag/semver/changelog khi phù hợp; SECURITY/CONTRIBUTING/license/metadata; đóng issue đã được implementation hoàn tất.                |
| P2          | Demo/portfolio evidence                        | K4, K5                | ⬜ OPEN        | Demo/deploy hoặc protected/static OpenAPI artifact; CV chỉ dùng metrics có thể tái lập.                                              |
| Conditional | Saga payment/refund runtime                    | F1 / audit #24        | ⚪ CONDITIONAL | Chỉ production-wire khi có payment/refund adapter thật hoặc demo adapter được mô tả rõ và có compensation/resume tests.              |

## 4. Các issue đang mở nhưng có dấu hiệu đã được implementation đóng

Rà và đóng/link PR/commit/test thay vì để backlog GitHub lệch với source:

- `#104` — full frontend-to-backend checkout journey in CI.
- `#103` — dependency boundaries in CI.
- `#101` — validate/version persisted outbox payloads.
- `#100` — controlled dead-letter replay and retention tooling.
- `#86` — order status concurrency + transactional outbox.

Các issue như `#102`, `#90`, `#84` cần rà từng acceptance criterion trước khi đóng vì còn phần deployed/runtime/failure-policy có thể chưa hoàn tất.

## 5. Thứ tự thực hiện đề xuất

1. **A1 — Durable event classification cho Auth/Reviews.**
2. **B2 + B3 — JWT `jti`/hash, `iss`/`aud`/token type và revocation semantics.**
3. **I7 / audit #32 — smoke image production vừa build trong CI.**
4. **T6 + T2 / audit #30 — kill-process/crash-window + lost-response/concurrent price scenario.**
5. **I9 / audit #33 — backup/restore + outbox replay + projection rebuild drill.**
6. **T7 — k6 performance evidence.**
7. **T4 — mutation testing cho domain/core.**
8. **D8/H10 — request-scope lifecycle và modularity theo nhu cầu.**
9. **J3 — admin audit logging.**
10. **I8/K3/K4/K5 — release, repo hygiene, demo và CV evidence.**

## 6. Definition of Done cho mốc portfolio rất mạnh

Dự án có thể được trình bày ở mức rất mạnh khi:

- `typecheck`, lint, architecture check, unit/integration/full-stack tests và build đều xanh.
- Durable side effects có policy crash/retry/idempotency rõ.
- Production image được **khởi chạy và smoke-test** trong CI, không chỉ build thành công.
- Có recovery drill cho DB/outbox/projection và ghi lại RTO/RPO quan sát được.
- JWT/security policy không phụ thuộc vào assumption ngầm.
- Có ít nhất một performance artifact và một mutation-testing artifact tái lập được.
- README/ARCHITECTURE/OPERATIONS/THREAT_MODEL thống nhất với code hiện tại.
- GitHub issue/PR/commit/test evidence không mâu thuẫn trạng thái implementation.
- CV dùng số liệu CI/load/mutation/concurrency thật, không dùng điểm AI như KPI.

## 7. Không cần làm chỉ để “tăng điểm OOP”

- Không biến mọi module CRUD thành aggregate.
- Không tạo interface cho mọi class.
- Không bắt mọi event nội bộ đi qua outbox.
- Không thêm State/Strategy/Saga chỉ để có tên pattern.
- Không refactor một adapter singleton nếu không có lợi ích testability/lifecycle cụ thể.
- Không gọi dự án “10/10” chỉ vì checklist hết ô OPEN.

> **NEXT:** A1 — phân loại durable side-effect events, bắt đầu từ Auth và Reviews.
