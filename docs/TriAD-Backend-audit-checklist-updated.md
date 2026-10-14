# TriAD Backend — Audit hiện trạng

**Đánh giá:** 15/10/2026 · **Code đối chiếu:** [main](https://github.com/Thang4869/TriAD-Backend), sau [PR #173](https://github.com/Thang4869/TriAD-Backend/pull/173).
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
| Rate limit Redis fail-closed | PASS CI, staging proof mở | [#162](https://github.com/Thang4869/TriAD-Backend/pull/162) |
| Durable UserRegistered + SIGKILL relay/dead-letter replay | PASS CI, real SMTP drill mở | [#164](https://github.com/Thang4869/TriAD-Backend/pull/164), [#169](https://github.com/Thang4869/TriAD-Backend/pull/169) |
| Security batch: proxy-addr/Multer/bcrypt/Nodemailer/Sharp | PASS CI | [#166](https://github.com/Thang4869/TriAD-Backend/pull/166), [#170](https://github.com/Thang4869/TriAD-Backend/pull/170) |
| Cloudinary SDK 2.x + OpenTelemetry SDK 2.x | PASS code CI, staging API/exporter smoke còn mở | [#172](https://github.com/Thang4869/TriAD-Backend/pull/172), [#173](https://github.com/Thang4869/TriAD-Backend/pull/173) |
| **npm audit main lockfile** | **Production 0 critical, 0 high, 0 moderate**; full graph 16 high/5 moderate | [Main CI](https://github.com/Thang4869/TriAD-Backend/actions) |

## Đang thực hiện

[Draft PR #174](https://github.com/Thang4869/TriAD-Backend/pull/174) trên **một nhánh ngày** \`commit-15102026\`:
- **T2:** test PostgreSQL lost-response checkout retry và product price changed before stock lock.
- **I9:** CI riêng pg_dump, pg_restore vào database khác, verify order/idempotency/outbox snapshot boundary, rebuild product/order-history projections; **không** được diễn giải thời gian CI thành production RTO/RPO.

**Thứ tự release gates còn mở:** staging Redis/BullMQ/SMTP TTL và dead letter (A1/T6), production-like PostgreSQL restore + RTO/RPO (I9), proxy/CSRF (B7/B6), FE canonical /api/orders contract (H2/T3), concurrency/projection lag metrics (T2), mutation/k6/SLO (T4/T7/J2), admin audit (J3) và license/security documentation (K3).

**Quyết định cần duyệt:** dependency high risk acceptance, email TTL/resend, proxy topology/CSRF, API deprecation date, payment/Saga provider scope. Tiêu chí đóng từng mục và các liên kết nằm trong [Improvement Checklist](TriAD-Backend-Improvement-Checklist.md), [Dependency Security](DEPENDENCY_SECURITY_AUDIT.md), [Event Durability](EVENT_DURABILITY.md) và [Operations](OPERATIONS.md).

Không tăng điểm chỉ vì bổ sung checklist. Điểm chỉ thay đổi khi có code, CI và evidence production/staging tương xứng.
