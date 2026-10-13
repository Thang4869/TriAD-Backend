# TriAD Backend — Audit & đánh giá hiện trạng

**Cập nhật:** 14/10/2026 · **Nguồn kiểm chứng:** `main` sau [PR #164](https://github.com/Thang4869/TriAD-Backend/pull/164), [CI của repository](https://github.com/Thang4869/TriAD-Backend/actions) và [Dependency Security Audit](DEPENDENCY_SECURITY_AUDIT.md). **Phạm vi điểm:** Backend; frontend chỉ được đánh giá ở mức tích hợp FE↔BE E2E.

> Các điểm dưới đây là **ước lượng chuyên môn**, không phải benchmark độc lập, chứng nhận Tech Lead hay cam kết production SLA. Không đưa điểm AI vào CV như một KPI.

## 1. Điểm hiện tại — đánh giá lại theo bằng chứng mới

| Hạng mục | Điểm / 10 | Bằng chứng và hạn chế quan trọng |
| --- | ---: | --- |
| **OOP / SOLID / DDD** | **9.2** | Aggregate/VO, DI, typed transitions, UoW, domain events; payment/Saga chưa có runtime provider thật. |
| **Clean Architecture** | **9.3** | Modular monolith, ports/adapters, modular composition root, dependency-cruiser CI gate. |
| **Clean Code / Maintainability** | **8.7** | Error taxonomy, structured boundaries tốt; naming, cast, TypeScript/ESLint tooling và API drift vẫn cần cleanup. |
| **Testing / CI** | **9.4** | Unit/integration/contract, architecture, build, production image runtime smoke, full FE↔BE E2E đều xanh ở PR #164; chưa có mutation/load gate. |
| **Reliability / concurrency** | **9.0** | Serializable checkout, idempotency, outbox retry/lease/tracker, order projection; A1 đã chuyển sang outbox nhưng chưa có kill-process/recovery drill đầy đủ. |
| **Security** | **7.1** | JWT/CSRF/rate limit/OAuth/upload có kiểm thử; **2 critical + 14 high production dependency advisories** chưa remediation, staging proxy/Redis chưa chứng minh. |
| **Production readiness** | **7.8** | Docker multi-stage + production image smoke PASS; thiếu deployed smoke, backup/restore RTO/RPO, SLO và dependency cleanup. |
| **Observability / Ops** | **8.5** | OTEL, Prometheus, Winston, alert/runbook foundation; còn dashboard SLO, log tracing correlation và admin audit trail. |
| **Tổng thể Backend (tham khảo)** | **~8.6** | Trung bình 8 mảng trên, làm tròn 1 chữ số; trọng số ngang nhau chỉ để so sánh tiến độ nội bộ. |

**So với bản cũ (~9.2/10):** việc hạ điểm là **đổi chuẩn đánh giá nghiêm hơn về security và evidence production**, không có nghĩa code OOP/architecture bị thoái hóa. Sau B7/A1, các cơ chế protection/recovery tốt hơn, nhưng một `npm audit` report-only **không** sửa lỗ hổng đã phát hiện. Điểm phải tăng theo evidence mới, không theo số checkbox đóng.

**Định vị:** đủ mạnh làm **portfolio backend nâng cao** với bằng chứng về thiết kế và CI. Có nhiều thực hành gắn với trách nhiệm Tech Lead (trade-off, architecture boundaries, reliability); **chưa thể chứng nhận “Tech Lead 10/10”** hoặc tự gọi hệ thống production-ready tuyệt đối khi thiếu deployed/recovery evidence.

## 2. Những gì đã được xác minh

| Evidence | Trạng thái | Tham chiếu |
| --- | --- | --- |
| Orders G5/G6, read-after-write fallback, OpenAPI aliases | **PASS CI, merged** | [#158](https://github.com/Thang4869/TriAD-Backend/pull/158), [#161](https://github.com/Thang4869/TriAD-Backend/pull/161) |
| B7 rate-limit identity/IP, Redis fail-closed | **PASS CI, merged**; thiếu staging proof | [#162](https://github.com/Thang4869/TriAD-Backend/pull/162) |
| B10 audit report & multipart regression | **PASS CI, merged**; vulnerabilities còn tồn tại | [#163](https://github.com/Thang4869/TriAD-Backend/pull/163) |
| A1 registration verification qua transactional outbox | **PASS CI, merged**; relay kill/replay/SMTP drill chưa đủ | [#164](https://github.com/Thang4869/TriAD-Backend/pull/164) |
| Image runtime smoke và FE↔BE checkout journey | **PASS CI** | [#160](https://github.com/Thang4869/TriAD-Backend/pull/160), [#164](https://github.com/Thang4869/TriAD-Backend/pull/164) |

**B10 — audit baseline từ CI 13/10/2026** (không thay cho lần quét mới sau khi upgrade):

| Mức độ | Production | Full lockfile |
| --- | ---: | ---: |
| Critical | 2 | 2 |
| High | 14 | 31 |
| Moderate | 49 | 53 |
| **Tổng** | **65** | **86** |

Rủi ro ưu tiên: `proxy-addr` IP spoofing/Express `req.ip` ([GHSA-jqcg-44mw-7w3h](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)), `tar` qua dependency của `bcrypt`, và legacy `multer` multipart DoS ([upstream advisories](https://github.com/expressjs/multer/security/advisories)). Nhánh ứng dụng vẫn khai báo `multer` 1.x và `bcrypt` 5.x. Không tự đánh đồng số advisories với số đường khai thác có thể chạm tới trong runtime.

## 3. Những gate còn thiếu — theo thứ tự quan trọng

| Gate | Mã | Cần thấy bằng chứng nào để đóng? |
| --- | --- | --- |
| **Security release gate** | **B10** | `package-lock.json` mới và npm audit production, targeted dependency upgrades, upload/auth regression, Docker smoke. Không có critical/high chưa triage hoặc chưa được chấp nhận có thời hạn. |
| **Outbox crash/recovery** | **A1 / T6** | Relay crash/restart, Redis/BullMQ outage, retry/dead-letter + resend; không mất durable intent, không overclaim exactly-once SMTP. |
| **Distributed checkout consistency** | **T2 / A8** | Lost-response retry, concurrent price update, projection lag p95/p99 và API eventual-consistency contract. |
| **Operational recovery** | **I9 / I6** | PostgreSQL restore + outbox replay + rebuild read model; RTO/RPO đo được, SIGTERM/readiness drain. |
| **Staging security** | **B7 / B6** | Proxy trust/IP spoof test, Redis fail-closed recovery, CSRF threat review, OAuth/refresh/logout smoke trên domain. |
| **API / FE compatibility** | **H2 / T3 / H7** | FE dùng canonical order endpoints, request/response schemas kiểm thử, không còn unsafe cast quan trọng. |
| **Production observability** | **J1 / J2 / J3** | trace/span in logs, SLO dashboard/alerts, admin audit records. |
| **Portfolio proof** | **T4 / T7 / K3–K5** | Mutation report, k6 results, license/SECURITY/CONTRIBUTING, demo hoặc protected OpenAPI. |

**Ngoài blocker:** payment/refund provider, Saga orchestration F1, thêm DI/ports/Strategy (D3/D5/H10/G10) chỉ khi use case thực sự xuất hiện. Không tạo pattern cho đẹp checklist.

## 4. Kết luận và mục tiêu mốc tiếp theo

**Ưu tiên triển khai ngay:** B10 (`proxy-addr` → Multer → `bcrypt`/`tar`, từng staged commit); tiếp theo A1/T6 kill/restart recovery và I9 backup/restore evidence. Tối ưu đánh giá lúc này bằng **giảm rủi ro runtime**, không thêm lớp OOP tượng trưng.

**Mục tiêu thực tế để cải thiện điểm:** ưu tiên kéo Security lên mức có đủ evidence, thiết lập quality gate dependency phù hợp và chứng minh khôi phục sau sự cố; rồi mới đầu tư perf/mutation/portfolio. Không hứa đạt đúng 10/10 chỉ nhờ hoàn thành danh sách.

**Review bắt buộc trước merge/release:** B10 dependency/risk acceptance; A1 TTL/SMTP + dead-letter policy; B6 CSRF, B7 trusted proxy; H2 backward-compatibility; production RTO/RPO. Quyết định/owner/acceptance chi tiết trong [Improvement Checklist](TriAD-Backend-Improvement-Checklist.md#các-quyết-định-cần-duyệt).

## 5. Liên kết kiểm chứng và tham khảo

- Source/CI: [TriAD Backend](https://github.com/Thang4869/TriAD-Backend) · [TriAD Frontend](https://github.com/Thang4869/TriAD-12) · [Actions](https://github.com/Thang4869/TriAD-Backend/actions) · [PRs](https://github.com/Thang4869/TriAD-Backend/pulls) · [Issues](https://github.com/Thang4869/TriAD-Backend/issues).
- Source docs: [Architecture](../README.md) · [Operations](OPERATIONS.md) · [Event durability](EVENT_DURABILITY.md) · [Dependency audit](DEPENDENCY_SECURITY_AUDIT.md) · [Threat model](THREAT_MODEL.md).
- External standard/advisories: [OWASP ASVS](https://github.com/OWASP/ASVS) · [proxy-addr security advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) · [Multer security advisories](https://github.com/expressjs/multer/security/advisories).

> **Bản Audit ghi nhận điểm và bằng chứng.** Chi tiết next actions, status và các quyết định phê duyệt nằm ở **Improvement Checklist**; tránh duy trì hai backlog trùng nội dung.
