# TriAD Backend — Improvement Checklist

**Cập nhật:** 18/10/2026 · **Nguồn:** `main` sau [PR #193](https://github.com/Thang4869/TriAD-Backend/pull/193) · **Mục đích:** phân biệt bằng chứng CI, gate staging còn mở và thứ tự công việc.

> `PASS CI` là bằng chứng về code/test, **không** đồng nghĩa đã xác minh hoạt động ở production. Điểm đánh giá và rủi ro nằm trong [Audit Checklist](TriAD-Backend-audit-checklist-updated.md).

## Đã hoàn thành — không mở lại nếu không có regression

- **Checkout / Order / OOP:** transaction `Serializable`, stock/idempotency, domain transitions G5/G6, owner-scoped order-detail fallback A8 và validation JSON projection G12 — [PR #158](https://github.com/Thang4869/TriAD-Backend/pull/158), [#161](https://github.com/Thang4869/TriAD-Backend/pull/161).
- **Architecture:** modular monolith, ports/adapters, DI composition D2/D6/D7/D8, dependency-cruiser gate, typed/versioned outbox payload C8, handler tracker, CQRS projections.
- **Security code:** JWT access/refresh/pre-auth B2/B3, CSRF baseline, OAuth state, B7 layered rate limiting + Redis fail-closed — [PR #162](https://github.com/Thang4869/TriAD-Backend/pull/162). B7 **chưa** có staging proxy/outage proof.
- **Reliability:** auth user/cart/`UserRegistered` cùng transaction; initial verification enqueue đã chuyển qua outbox A1, replay/idempotency tests CI PASS — [PR #164](https://github.com/Thang4869/TriAD-Backend/pull/164). Chưa chứng minh SMTP exactly-once (không phải cam kết của hệ thống).
- **Quality gates:** unit/integration/contract/architecture/build và FE↔BE E2E trong CI; image runtime smoke đã PASS — [PR #160](https://github.com/Thang4869/TriAD-Backend/pull/160), [#164](https://github.com/Thang4869/TriAD-Backend/pull/164).
- **B10 remediation batches 1–2:** npm-generated lockfile đã vá `proxy-addr`, nâng Multer/bcrypt và bật CI gate chặn production critical; tất cả CI PASS [PR #166](https://github.com/Thang4869/TriAD-Backend/pull/166). **Production audit trên main hiện 0 critical/high/moderate; full graph còn 16 high / 5 moderate**.

## Tiến độ refactor theo đợt (18/10/2026)

- **Đợt 1 — Security/Reliability (PARTIAL):** B7 HTTP 429/503 tests, idempotency owner fencing và heartbeat, 2FA Redis fail-closed, malformed CSRF cookie validation. Đã bổ sung [idempotency recovery acceptance](IDEMPOTENCY_RECOVERY.md) và [rate limit staging drill](RATE_LIMIT_STAGING_DRILL.md). Chưa đóng #84/#90/#140 vì Redis/proxy staging, process-crash recovery và cross-origin evidence chưa được nghiệm thu.
- **Đợt 2 — Architecture/API (IN PROGRESS):** Sửa việc giữ instance scoped cũ khi `register()` hoặc `override()` thay factory trong cùng container; bổ sung regression tests. FE migration sang `/api/orders`, OpenAPI contracts, read-after-write consistency và request-scope usage vẫn đang mở.
- **Quy tắc merge:** không suy diễn production PASS từ unit tests; đối chiếu CI tại SHA cuối của PR trước khi merge.

## Backlog ưu tiên — việc còn phải hoàn thành theo thứ tự

Các mức ưu tiên phản ánh rủi ro release và bằng chứng còn thiếu. **P0** là gate cần đóng trước production; **P1** là rủi ro chất lượng/bảo mật cần xử lý trước khi mở rộng rollout; **P2** là nâng độ tin cậy và khả năng vận hành sau khi các gate P0 đã có chủ sở hữu, kế hoạch và bằng chứng. Không đóng issue chỉ dựa trên test giả lập hoặc tài liệu.

| Thứ tự | Ưu tiên | Issue | Việc cần hoàn tất / bằng chứng để đóng | Trạng thái hiện tại |
| ---: | --- | --- | --- | --- |
| 1 | **P0 — release gate** | [#143](https://github.com/Thang4869/TriAD-Backend/issues/143) · I9/I6 | Chạy backup/restore trên staging hoặc môi trường production-like sạch; khôi phục PostgreSQL, replay outbox/rebuild projections, chạy SIGTERM readiness drill; ghi RTO/RPO thực đo và quyết định Redis persistence/eviction. Lưu log, timestamp, kết quả đối chiếu và runbook rollback. | CI backup/restore cách ly PASS; **deployed restore và RTO/RPO chưa có**. |
| 2 | **P0 — security release gate** | [#140](https://github.com/Thang4869/TriAD-Backend/issues/140) · B7 | Xác nhận topology `TRUST_PROXY`, spoofed `X-Forwarded-For`, shared NAT, policy health/readiness và Redis disconnect/reconnect qua proxy staging; lưu cấu hình/log chứng minh 429/503. | Unit HTTP contract và real-Redis integration (**429, outage 503/reconnect, first SCRIPT LOAD outage**) **PASS CI trong [PR #193](https://github.com/Thang4869/TriAD-Backend/pull/193)**; staging/proxy evidence còn thiếu. Dùng [rate-limit drill](RATE_LIMIT_STAGING_DRILL.md). |
| 3 | **P0 — checkout recovery** | [#84](https://github.com/Thang4869/TriAD-Backend/issues/84) | Thực hiện retry sau timeout/mất response và process crash trên staging; xác nhận lease/owner fencing, replay cùng idempotency key không tạo order/trừ stock lần hai; lưu Redis state và order/stock đối chiếu. | CI chứng minh các nhánh idempotency hiện có; **process-crash và staging recovery chưa được nghiệm thu**. Dùng [idempotency recovery](IDEMPOTENCY_RECOVERY.md). |
| 4 | **P1 — dependency/configuration** | [#141](https://github.com/Thang4869/TriAD-Backend/issues/141) · B10 | Duy trì production audit gate 0 critical/high; phân loại 16 high/5 moderate của full graph, lập ngoại lệ có thời hạn nếu cần; kiểm tra SBOM và xác minh Cloudinary/OTLP với config staging thật. | Production audit trên main 0 critical/high/moderate; full graph và staging smoke còn mở. |
| 5 | **P1 — CSRF/auth boundary** | [#90](https://github.com/Thang4869/TriAD-Backend/issues/90) · B6 | Chốt threat model CSRF/proxy trust bằng test cross-origin với browser/cookie settings thực tế; ghi quyết định signed token hay giữ thiết kế hiện tại và bằng chứng reject/accept. | Baseline CI có; cross-origin staging/browser evidence và quyết định threat model còn mở. |
| 6 | **P1 — architecture** | [#146](https://github.com/Thang4869/TriAD-Backend/issues/146) | Hoàn tất DI container modularization chỉ nơi còn giảm coupling thực; giữ dependency-cruiser architecture gate và thêm regression test cho registration/override/scoped instance. | Một regression đã được sửa; xác minh issue acceptance criteria còn lại trước khi đóng. |
| 7 | **P1 — API contract** | [#148](https://github.com/Thang4869/TriAD-Backend/issues/148) · H2/T3 | Chuyển FE sang `/api/orders*`; thêm OpenAPI request/response contract cho luồng chính; chỉ bỏ checkout aliases sau FE E2E, deprecation window và compatibility review. | Migration/contracts còn một phần; chưa gỡ alias. |
| 8 | **P1 — performance evidence** | [#144](https://github.com/Thang4869/TriAD-Backend/issues/144) · T7 | Chạy k6 trên staging với checkout contention; công bố p95/p99, error rate, throughput và resource saturation cùng ngưỡng chấp nhận. | Chưa có baseline load production-like. |
| 9 | **P2 — test strength** | [#145](https://github.com/Thang4869/TriAD-Backend/issues/145) · T4 | Tạo mutation-test baseline cho domain/core; đặt ngưỡng theo module trọng yếu và xử lý mutation sống có ý nghĩa. | Chưa có báo cáo mutation. |
| 10 | **P2 — auditability** | [#147](https://github.com/Thang4869/TriAD-Backend/issues/147) · J3 | Lưu admin actor/target/action/outcome với redaction; thêm authorization, retention và audit-log tests. | Chưa hoàn tất end-to-end. |
| 11 | **P2 — release/demo** | [#149](https://github.com/Thang4869/TriAD-Backend/issues/149), [#150](https://github.com/Thang4869/TriAD-Backend/issues/150) · I8/K4 | Chuẩn hóa tag/changelog/deploy rollback; hoàn thiện demo được bảo vệ và chỉ dùng CV metrics có nguồn kiểm chứng. | Còn mở; không chặn release nếu vận hành nội bộ không yêu cầu demo. |

**Thứ tự tiếp theo:** #140 code gate đã PASS CI qua [PR #193](https://github.com/Thang4869/TriAD-Backend/pull/193); chuẩn bị staging runbooks/ownership cho #143 → #140 → #84. Sau đó xử lý B10/CSRF và API compatibility; k6/mutation/audit trail theo sau. Những bước cần endpoint, secret hoặc dữ liệu staging phải được đánh dấu **BLOCKED ON ENVIRONMENT**, không giả lập đã xong.

**Backlog có điều kiện, không phải blocker:** D3/D5/H10 (thêm DI/port/split chỉ khi cần), F1/G3/G10 (payment/Saga/Strategy khi có provider use case thật), G2/G11/G13–G16 (domain cleanup theo invariant), H4/H5/H8/H12/H13 (naming/dependency hygiene), T1/T8 (test helpers/API tests), J4 (error docs/versioning). Không tăng số lượng pattern/interface để theo đuổi “10/10”.

## Các quyết định cần duyệt

| Quyết định | Nội dung cần duyệt | Mốc phê duyệt |
| --- | --- | --- |
| **R1 — Dependency policy** | Thứ tự nâng phiên bản, breaking-change budget, `npm audit` blocking threshold, cơ chế chấp nhận rủi ro có thời hạn. | Trước khi merge B10 remediation |
| **R2 — Email UX / reliability** | TTL link 15 phút so với relay delay, dead-letter và resend behavior; không tuyên bố “exactly once email”. | Trước release đăng ký tài khoản |
| **R3 — CSRF / proxy trust** | Signed double-submit có cần không; `TRUST_PROXY` đúng topology để bảo vệ IP rate limit. | Trước staging / production |
| **R4 — API compatibility** | Thời hạn chuyển FE sang `/api/orders`; deprecation/removal của checkout read aliases. | Trước breaking API change |
| **R5 — Payment scope** | COD/transaction-based hiện tại hay tích hợp gateway thật; chỉ production-wire Saga nếu có settlement/refund semantics. | Trước triển khai payment thật |
| **R6 — License / distribution** | Chủ repository chọn **MIT License**, copyright 2026 Thang4869; được chia sẻ code cho sinh viên/cộng đồng theo điều kiện MIT; kiểm tra riêng quyền của assets bên thứ ba. | **APPROVED 15/10/2026** |

## Thứ tự triển khai sau checklist này

1. **#140 code gate đã PASS CI** trong [PR #193](https://github.com/Thang4869/TriAD-Backend/pull/193): Redis thật xác nhận HTTP 429, 503 khi mất kết nối và hồi phục sau reconnect, kể cả lỗi lúc nạp script đầu tiên.
2. **Chuẩn bị và chạy #143:** staging restore drill, replay/rebuild, SIGTERM, đo RTO/RPO; cập nhật [recovery drill](RECOVERY_DRILL.md) và [operations runbook](OPERATIONS.md) bằng kết quả thật.
3. **Chạy #140 staging:** proxy trust, IP spoofing/NAT, health policy và Redis outage/recovery; lưu log/cấu hình trong [rate-limit drill](RATE_LIMIT_STAGING_DRILL.md).
4. **Chạy #84 staging:** mất response/process crash, retry cùng key, fencing và đối chiếu order/stock; lưu bằng chứng trong [idempotency recovery](IDEMPOTENCY_RECOVERY.md).
5. **Rà #141/#90:** dependency exceptions/SBOM/config smoke và CSRF cross-origin; ghi quyết định bảo mật, chủ sở hữu và hạn xử lý.
6. **Đóng API/architecture gates #146/#148:** DI acceptance criteria, OpenAPI contracts, FE canonical route E2E và deprecation plan.
7. **Bổ sung quality evidence #144/#145/#147:** k6, mutation score và admin audit trail; sau đó hoàn thiện release/demo #149/#150.

**Definition of Done:** typecheck, lint, architecture, unit/integration, contract, build, Docker runtime smoke và FE↔BE E2E PASS; thay đổi security có audit + lockfile; thay đổi durability có recovery test; thay đổi API có backward-compatibility review. Chỉ đánh dấu **CLOSED** khi cả acceptance criteria và evidence phù hợp đã hoàn thành.

## Liên kết / nguồn tham khảo

- Dự án: [Backend](https://github.com/Thang4869/TriAD-Backend) · [Frontend](https://github.com/Thang4869/TriAD-12) · [Actions](https://github.com/Thang4869/TriAD-Backend/actions) · [Issues](https://github.com/Thang4869/TriAD-Backend/issues).
- Evidence: [Orders #161](https://github.com/Thang4869/TriAD-Backend/pull/161) · [Rate limit #162](https://github.com/Thang4869/TriAD-Backend/pull/162) · [Audit #163](https://github.com/Thang4869/TriAD-Backend/pull/163) · [Auth outbox #164](https://github.com/Thang4869/TriAD-Backend/pull/164).
- Security: [proxy-addr GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) · [Multer advisories](https://github.com/expressjs/multer/security/advisories) · [OWASP ASVS](https://github.com/OWASP/ASVS).
- Chi tiết vận hành: [Event durability](EVENT_DURABILITY.md) · [Dependency audit](DEPENDENCY_SECURITY_AUDIT.md) · [Operations](OPERATIONS.md) · [Threat model](THREAT_MODEL.md).


## Cổng nghiệm thu theo checklist P0–P9 (18/10/2026)

Tài liệu chuẩn hóa: [Production Readiness Gates](PRODUCTION_READINESS_GATES.md). Mỗi phase chỉ PASS khi tất cả acceptance criteria có commit, CI và log/môi trường tương ứng. Những mục đã có CI PASS không bị tính là chưa làm; staging gate không được coi là PASS do có unit/integration tests.

**Thứ tự hiện hành:** G0 truth sync → G1 hygiene → G2 Clean Code → G3 domain invariants → G4 reliability → G5 staging recovery/auth → G6 k6/mutation → G7 telemetry/audit → G8 demo → G9 CV. Có thể triển khai độc lập song song nhưng không xác nhận gate sau hoàn tất nếu gate trước chưa PASS. Điểm thiếu theo DOCX gồm bảng invariant, type/DTO cleanup baseline, k6/mutation reporting, Jaeger correlation, INTERVIEW_QA và reviewer evidence.

**P0 môi trường chưa nghiệm thu:** [#143](https://github.com/Thang4869/TriAD-Backend/issues/143) measured restore/RTO-RPO; [#140](https://github.com/Thang4869/TriAD-Backend/issues/140) staging proxy/Redis; [#84](https://github.com/Thang4869/TriAD-Backend/issues/84) process-kill checkout retry. Không đóng các issue này chỉ bằng test fixture.

## Cập nhật bằng chứng code — 18/10/2026

- [#197](https://github.com/Thang4869/TriAD-Backend/pull/197) — Product/Cart stock/quantity validation, safe-integer checks, overflow tests; domain map và CHANGELOG.
- [#198](https://github.com/Thang4869/TriAD-Backend/pull/198) — Order không bị đặt dở khi tính tổng lỗi; CartService bảo vệ đầu vào; `updateItem` trả `CartItemWithProduct | null`; FE↔BE E2E và image smoke PASS.
- [#199](https://github.com/Thang4869/TriAD-Backend/pull/199) — Reviews/Wishlist/Notifications dùng concrete DTO, có ADR cho các module CRUD; CI PASS.

Các mục này là **subtasks đã hoàn thành**, không phải gate G2/G3 PASS hoàn toàn. P0 staging recovery [#143](https://github.com/Thang4869/TriAD-Backend/issues/143), rate limit [#140](https://github.com/Thang4869/TriAD-Backend/issues/140) và checkout retry [#84](https://github.com/Thang4869/TriAD-Backend/issues/84) vẫn BLOCKED ON ENVIRONMENT. Không tăng điểm hoặc đóng issue chỉ từ ba PR trên.
