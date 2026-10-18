# TriAD Backend — Audit hiện trạng

**Cập nhật:** 18/10/2026 · **Code đối chiếu:** [main](https://github.com/Thang4869/TriAD-Backend), sau [PR #192](https://github.com/Thang4869/TriAD-Backend/pull/192). Điểm dưới đây giữ nguyên baseline tham khảo 15/10; chưa chấm lại từ thay đổi tài liệu.
**Độc lập:** điểm ước lượng kỹ thuật để theo dõi, **không** phải chứng nhận Tech Lead, SLA, bảo mật hoặc KPI được kiểm toán.

## Điểm tham khảo

| Mảng | /10 | Bằng chứng / tồn đọng |
| --- | ---: | --- |
| OOP, SOLID, DDD | 9.2 | Aggregates, typed transitions, UoW, Domain Events; payment provider/Saga thật chưa có |
| Clean Architecture | 9.3 | Modular monolith, DI/ports/adapters, dependency-cruiser CI |
| Clean Code | 8.7 | Error taxonomy và code boundaries; type assertions, API drift và lint modernization còn tồn đọng |
| Testing & CI | 9.4 | Unit/integration, contract, build, Docker runtime, FE↔BE E2E PASS; mutation/load baseline chưa đủ |
| Reliability/concurrency | 9.0 | Serializable checkout, idempotency, Outbox SIGKILL/dead-letter tests; staging SMTP và load race vẫn mở |
| Security | 8.5 | Production npm audit **0 critical / 0 high / 0 moderate** trên main; full graph 16 high/5 moderate; proxy/SMTP/Cloudinary staging chưa chứng minh |
| Production readiness | 7.8 | Docker smoke + shutdown; deployed backup restore/RTO/RPO, real staging drill và rollback chưa chứng minh |
| Observability & Ops | 8.5 | OpenTelemetry SDK 2.x, Prometheus/alert runbook; end-to-end collector and SLO evidence chưa đủ |
| **Tổng thể tham khảo** | **~8.8** | Trung bình các mảng trên, làm tròn 1 chữ số |

**Định vị:** portfolio backend mức nâng cao, có nhiều bằng chứng thiết kế và kỹ thuật vận hành. **Không được kết luận production-ready hoàn toàn** vì còn các validation gắn môi trường và bài đo thời gian phục hồi chưa được thực hiện.

## Evidence quan trọng (đã merge)

| Mục | Kết quả | PR |
| --- | --- | --- |
| Checkout Serializable/stock/order transitions | PASS CI | [#158](https://github.com/Thang4869/TriAD-Backend/pull/158), [#161](https://github.com/Thang4869/TriAD-Backend/pull/161) |
| Rate limit Redis fail-closed | Unit HTTP contract PASS; real-Redis integration test đang chờ CI trong PR checklist hiện tại; staging proof mở | [#162](https://github.com/Thang4869/TriAD-Backend/pull/162) · [#140](https://github.com/Thang4869/TriAD-Backend/issues/140) |
| Durable UserRegistered + SIGKILL relay/dead-letter replay | PASS CI, real SMTP drill mở | [#164](https://github.com/Thang4869/TriAD-Backend/pull/164), [#169](https://github.com/Thang4869/TriAD-Backend/pull/169) |
| Security batch: proxy-addr/Multer/bcrypt/Nodemailer/Sharp | PASS CI | [#166](https://github.com/Thang4869/TriAD-Backend/pull/166), [#170](https://github.com/Thang4869/TriAD-Backend/pull/170) |
| Cloudinary SDK 2.x + OpenTelemetry SDK 2.x | PASS code CI, staging API/exporter smoke còn mở | [#172](https://github.com/Thang4869/TriAD-Backend/pull/172), [#173](https://github.com/Thang4869/TriAD-Backend/pull/173) |
| **npm audit main lockfile** | **Production 0 critical, 0 high, 0 moderate**; full graph 16 high/5 moderate | [Main CI](https://github.com/Thang4869/TriAD-Backend/actions) |

## Trạng thái hiện tại và gate còn mở

[PR #192](https://github.com/Thang4869/TriAD-Backend/pull/192) đã merge: cập nhật recovery, idempotency và rate-limit runbooks/evidence template. Tài liệu giúp thu thập bằng chứng; không tự chứng minh staging hoặc production đã đạt.

Kiểm thử integration rate-limit với Redis thật đang được bổ sung: dự kiến xác nhận 429 khi vượt ngưỡng, 503 khi Redis client disconnect và 200 sau reconnect. Trạng thái chỉ chuyển sang **CI PASS** sau khi PR chạy xanh; staging proxy/outage vẫn là gate riêng của [#140](https://github.com/Thang4869/TriAD-Backend/issues/140).

**Thứ tự gate còn mở:**

1. [#143 — Restore và RTO/RPO](https://github.com/Thang4869/TriAD-Backend/issues/143): deployed PostgreSQL restore, outbox replay/projection rebuild, SIGTERM/readiness, Redis persistence/eviction.
2. [#140 — Rate limit trên proxy staging](https://github.com/Thang4869/TriAD-Backend/issues/140): trust proxy, XFF spoofing, NAT, Redis disconnect/reconnect, 429/503.
3. [#84 — Checkout idempotency recovery](https://github.com/Thang4869/TriAD-Backend/issues/84): mất response/process crash, retry và đối chiếu order/stock không nhân đôi.
4. [#141 — Dependency/configuration](https://github.com/Thang4869/TriAD-Backend/issues/141) và [#90 — CSRF](https://github.com/Thang4869/TriAD-Backend/issues/90): SBOM/full graph exceptions, staging integrations và cross-origin evidence.
5. [#146/#148 — Architecture/API](https://github.com/Thang4869/TriAD-Backend/issues/146): hoàn thành DI acceptance criteria, OpenAPI contracts và FE canonical route E2E.
6. [#144/#145/#147 — Quality/operations](https://github.com/Thang4869/TriAD-Backend/issues/144): load test, mutation baseline và admin audit trail; [#149/#150](https://github.com/Thang4869/TriAD-Backend/issues/149) theo sau.

Các hạng mục cần staging credentials/endpoint được ghi **BLOCKED ON ENVIRONMENT** cho đến khi có kết quả thực. Không thay đổi điểm tham khảo 8.8 chỉ từ việc sửa checklist hoặc thêm test chưa chạy.

**Quyết định cần duyệt:** dependency high risk acceptance, email TTL/resend, proxy topology/CSRF, API deprecation date, payment/Saga provider scope. Tiêu chí đóng từng mục và các liên kết nằm trong [Improvement Checklist](TriAD-Backend-Improvement-Checklist.md), [Dependency Security](DEPENDENCY_SECURITY_AUDIT.md), [Event Durability](EVENT_DURABILITY.md) và [Operations](OPERATIONS.md).

Không tăng điểm chỉ vì bổ sung checklist. Điểm chỉ thay đổi khi có code, CI và evidence production/staging tương xứng.
