# TriAD Backend — Improvement Checklist

**Cập nhật:** 15/10/2026 · **Nguồn:** `main` sau [PR #171](https://github.com/Thang4869/TriAD-Backend/pull/171) · **Mục đích:** chỉ giữ công việc còn cần làm, các quyết định và tiêu chí nghiệm thu.

> `PASS CI` là bằng chứng về code/test, **không** đồng nghĩa đã xác minh hoạt động ở production. Điểm đánh giá và rủi ro nằm trong [Audit Checklist](TriAD-Backend-audit-checklist-updated.md).

## Đã hoàn thành — không mở lại nếu không có regression

- **Checkout / Order / OOP:** transaction `Serializable`, stock/idempotency, domain transitions G5/G6, owner-scoped order-detail fallback A8 và validation JSON projection G12 — [PR #158](https://github.com/Thang4869/TriAD-Backend/pull/158), [#161](https://github.com/Thang4869/TriAD-Backend/pull/161).
- **Architecture:** modular monolith, ports/adapters, DI composition D2/D6/D7/D8, dependency-cruiser gate, typed/versioned outbox payload C8, handler tracker, CQRS projections.
- **Security code:** JWT access/refresh/pre-auth B2/B3, CSRF baseline, OAuth state, B7 layered rate limiting + Redis fail-closed — [PR #162](https://github.com/Thang4869/TriAD-Backend/pull/162). B7 **chưa** có staging proxy/outage proof.
- **Reliability:** auth user/cart/`UserRegistered` cùng transaction; initial verification enqueue đã chuyển qua outbox A1, replay/idempotency tests CI PASS — [PR #164](https://github.com/Thang4869/TriAD-Backend/pull/164). Chưa chứng minh SMTP exactly-once (không phải cam kết của hệ thống).
- **Quality gates:** unit/integration/contract/architecture/build và FE↔BE E2E trong CI; image runtime smoke đã PASS — [PR #160](https://github.com/Thang4869/TriAD-Backend/pull/160), [#164](https://github.com/Thang4869/TriAD-Backend/pull/164).
- **B10 remediation batches 1–2:** npm-generated lockfile đã vá `proxy-addr`, nâng Multer/bcrypt và bật CI gate chặn production critical; tất cả CI PASS [PR #166](https://github.com/Thang4869/TriAD-Backend/pull/166). **Production còn 9 high chưa triage hết**.

## Backlog ưu tiên (chỉ các gap có tác động)

| Ưu tiên | Mã | Việc cần làm / điều kiện đóng | Trạng thái |
| --- | --- | --- | --- |
| **P0** | **B10** | [PR #170](https://github.com/Thang4869/TriAD-Backend/pull/170) merged: **0 critical / 9 high / 49 moderate** production. [PR #172](https://github.com/Thang4869/TriAD-Backend/pull/172) nâng Cloudinary 2.11.0 (chờ CI/audit), kế tiếp OpenTelemetry đồng bộ. | **PARTIAL — 9 high on main; Cloudinary pending** |
| **P0** | **A1 / T6** | [PR #167](https://github.com/Thang4869/TriAD-Backend/pull/167) đã merge; [PR #169](https://github.com/Thang4869/TriAD-Backend/pull/169) đã merge, bổ sung **SIGKILL relay thực + replay dead-letter thủ công** với PostgreSQL/tracker thật, full CI PASS. Còn staging drill Redis/BullMQ/SMTP thật, 15 phút TTL và dead-letter alerting trước khi CLOSED. | **PARTIAL — process kill test PASS; staging pending** |
| **P1** | **T2 / T6 / A8** | Lost-response checkout retry, concurrent price change và relay/process crash; đo projection lag thực tế, công bố contract consistency cho order list/detail. | PARTIAL |
| **P1** | **I9 / I6** | Backup → restore PostgreSQL, replay outbox, rebuild projection; ghi RTO/RPO; readiness-draining + SIGTERM drill. | OPEN |
| **P1** | **B7** | Staging: `TRUST_PROXY`, spoofed `X-Forwarded-For`, shared NAT, Redis disconnect/reconnect, HTTP 429/503. Đóng chỉ khi có log/evidence cấu hình thật. | PENDING deployment |
| **P1** | **B6** | Review threat model và CSRF hiện tại; quyết định có cần session-bound signed token hay giữ existing approach. Chỉ refactor nếu có lý do bảo mật kiểm chứng. | REVIEW |
| **P1** | **H2 / T3** | Frontend chuyển khỏi legacy `/api/checkout/orders*` sang canonical `/api/orders*`; mở rộng OpenAPI response/request contract; xóa alias chỉ khi FE E2E và versioning cho phép. | PARTIAL |
| **P2** | **H7 / G12 / H11** | Rà unsafe cast/JSON boundary, `console.*`, nâng ESLint/TypeScript rules theo từng commit khi baseline sạch. | PARTIAL |
| **P2** | **J1 / J2 / J3** | Trace/span ID trong logs; SLO + dashboard/alert runbook; audit trail admin với actor/target/outcome. | PARTIAL |
| **P2** | **T7 / T4** | k6 checkout/load evidence (p95/p99/errors) và mutation-test report cho domain/core. | OPEN |
| **P2** | **I2 / I4 / I8 / I10** | Pin/scanning/SBOM, deployment resource/migration strategy, release tags/changelog và env/secret injection review. | PARTIAL |
| **P3** | **K2 / K3 / K4 / K5** | ADR, `SECURITY.md`/`CONTRIBUTING.md`/license, demo hoặc protected OpenAPI artifact, CV dùng metrics có nguồn. | OPEN |

**Backlog có điều kiện, không phải blocker:** D3/D5/H10 (thêm DI/port/split chỉ khi cần), F1/G3/G10 (payment/Saga/Strategy khi có provider use case thật), G2/G11/G13–G16 (domain cleanup theo invariant), H4/H5/H8/H12/H13 (naming/dependency hygiene), T1/T8 (test helpers/API tests), J4 (error docs/versioning). Không tăng số lượng pattern/interface để theo đuổi “10/10”.

## Các quyết định cần duyệt

| Quyết định | Nội dung cần duyệt | Mốc phê duyệt |
| --- | --- | --- |
| **R1 — Dependency policy** | Thứ tự nâng phiên bản, breaking-change budget, `npm audit` blocking threshold, cơ chế chấp nhận rủi ro có thời hạn. | Trước khi merge B10 remediation |
| **R2 — Email UX / reliability** | TTL link 15 phút so với relay delay, dead-letter và resend behavior; không tuyên bố “exactly once email”. | Trước release đăng ký tài khoản |
| **R3 — CSRF / proxy trust** | Signed double-submit có cần không; `TRUST_PROXY` đúng topology để bảo vệ IP rate limit. | Trước staging / production |
| **R4 — API compatibility** | Thời hạn chuyển FE sang `/api/orders`; deprecation/removal của checkout read aliases. | Trước breaking API change |
| **R5 — Payment scope** | COD/transaction-based hiện tại hay tích hợp gateway thật; chỉ production-wire Saga nếu có settlement/refund semantics. | Trước triển khai payment thật |

## Thứ tự triển khai tiếp theo (mỗi stage một commit)

1. **A1 / T6:** kiểm chứng CI cho integration recovery và verify-email DB error; chạy kill-process/SMTP/Redis drill thật, ghi bằng chứng lease/retry/dead-letter + TTL.
2. **B10:** xử lý 9 high production vulnerabilities theo gói dependency có rủi ro thấp → cao, cập nhật lockfile và audit evidence; không dùng `npm audit fix --force`.
3. **T2/T6/I9:** checkout retry + concurrency; backup/restore/rebuild projection; lưu logs/RTO/RPO/lag evidence.
4. **B7/H2/H7/T3:** staging security, FE migration và schema/API boundary cleanup.
5. **J3/T7/T4/K3:** admin audit trail, load/mutation artifacts và portfolio evidence.

**Definition of Done:** typecheck, lint, architecture, unit/integration, contract, build, Docker runtime smoke và FE↔BE E2E PASS; thay đổi security có audit + lockfile; thay đổi durability có recovery test; thay đổi API có backward-compatibility review. Chỉ đánh dấu **CLOSED** khi cả acceptance criteria và evidence phù hợp đã hoàn thành.

## Liên kết / nguồn tham khảo

- Dự án: [Backend](https://github.com/Thang4869/TriAD-Backend) · [Frontend](https://github.com/Thang4869/TriAD-12) · [Actions](https://github.com/Thang4869/TriAD-Backend/actions) · [Issues](https://github.com/Thang4869/TriAD-Backend/issues).
- Evidence: [Orders #161](https://github.com/Thang4869/TriAD-Backend/pull/161) · [Rate limit #162](https://github.com/Thang4869/TriAD-Backend/pull/162) · [Audit #163](https://github.com/Thang4869/TriAD-Backend/pull/163) · [Auth outbox #164](https://github.com/Thang4869/TriAD-Backend/pull/164).
- Security: [proxy-addr GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) · [Multer advisories](https://github.com/expressjs/multer/security/advisories) · [OWASP ASVS](https://github.com/OWASP/ASVS).
- Chi tiết vận hành: [Event durability](EVENT_DURABILITY.md) · [Dependency audit](DEPENDENCY_SECURITY_AUDIT.md) · [Operations](OPERATIONS.md) · [Threat model](THREAT_MODEL.md).
