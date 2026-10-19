# TriAD Backend — Work Checklist

**Cập nhật:** 2026-10-19 (đối chiếu source code, CI và issue acceptance) · **Phạm vi:** chỉ những việc **chưa xong / đang làm / cần nghiệm thu**. Đây là checklist điều hành duy nhất, không phải báo cáo điểm số. Đã hoàn thành thì xóa dòng khỏi file sau khi có bằng chứng, giữ lịch sử trong GitHub Issues/PRs/Actions.

**Trạng thái:** `[ ]` Chưa hoàn thành · `[~]` Đang làm / đã có code nhưng thiếu nghiệm thu · `[B]` Cần môi trường, dữ liệu hoặc quyết định bổ sung. Không tự chuyển sang hoàn thành chỉ vì CI xanh. Trong lúc chờ staging cloud, có thể thực hiện `production-like` trên máy cá nhân (Docker Compose) và ghi chính xác loại môi trường.

## P0 — Ưu tiên làm trước

- [~] **[#143 — Backup, restore và recovery](https://github.com/Thang4869/TriAD-Backend/issues/143):** Local recovery PASS (`3f4ad02`, 2026-10-19; 9.866s từ backup có sẵn đến HTTP/API ready, không phải production RTO). **Còn làm:** xác nhận lịch backup, retention, encryption/off-site/key recovery; phê duyệt và đo RPO thực tế; nghiệm thu BullMQ/Outbox Relay, authenticated API, cutover/rollback và staging deployment. [Evidence/runbook](RECOVERY_DRILL.md).
- [~] **[#140 — Redis + reverse proxy](https://github.com/Thang4869/TriAD-Backend/issues/140):** Dựng proxy local tương đương topology production; thử `TRUST_PROXY`, giả mạo `X-Forwarded-For`, shared NAT, HTTP 429/503, Redis disconnect/reconnect, startup Lua SCRIPT LOAD và health policy; lưu cấu hình, logs và giới hạn môi trường. [Runbook](RATE_LIMIT_STAGING_DRILL.md).
- [~] **[#84 — Checkout crash/retry](https://github.com/Thang4869/TriAD-Backend/issues/84):** Test mất response, kill process và retry cùng idempotency key; so sánh order/stock/Redis lease-owner fencing; khẳng định không nhân đôi order/trừ stock, lưu kịch bản/lệnh/log thực thi. [Runbook](IDEMPOTENCY_RECOVERY.md).
- [~] **[#102 — Production Compose + smoke](https://github.com/Thang4869/TriAD-Backend/issues/102):** Kiểm tra file collector mount/paths, môi trường/secrets, service dependencies và migrations; chạy `docker compose config`, image build, ready/API smoke, SIGTERM trong môi trường sạch. Đối chiếu bằng chứng CI hiện có trước khi đóng; không mặc định CI image smoke đồng nghĩa production Compose đã nghiệm thu.

## P1 — Hoàn thiện code, security và contract

- [ ] **[#141 — Dependency/config](https://github.com/Thang4869/TriAD-Backend/issues/141):** Chạy audit trên lockfile hiện tại, phân loại advisories ở cả prod/dev, xác minh test-only secret không lọt runtime, upload regression, staging Cloudinary/OTLP, lưu quyết định chấp nhận rủi ro có hạn; không dùng số liệu audit cũ như kết quả mới.
- [~] **[#90 — Browser CSRF / origin](https://github.com/Thang4869/TriAD-Backend/issues/90):** Test cookie/SameSite/Secure, cross-origin requests, Bearer bypass, credentials, OAuth callback, HTTPS/proxy và negative cases trong trình duyệt thực; ghi threat-model decision.
- [~] **[#146 — DI / composition root](https://github.com/Thang4869/TriAD-Backend/issues/146):** Kiểm tra registration theo module, reuse Auth adapter, request scope có tác dụng hay bỏ, health injection, không service locator; regression tests + architecture/typecheck/lint.
- [~] **[#148 — OpenAPI/FE route](https://github.com/Thang4869/TriAD-Backend/issues/148):** Thêm schema request/response và negative-case contract cho auth/product/cart/checkout/orders; xác định source of truth Zod; chuyển FE sang canonical `/api/orders` nếu còn alias, xác minh FE↔BE E2E trước deprecation.
- [ ] **[#139 — Order read-after-write](https://github.com/Thang4869/TriAD-Backend/issues/139):** Quyết định eventual consistency hay read-your-writes; định nghĩa độ trễ cho phép, bounded authoritative fallback (nếu cần), UI pending state và behavior khi projection lỗi; integration test delay ngay sau checkout.

## P2 — Bằng chứng chất lượng, observability và xuất bản

- [ ] **[#144 — k6 contention](https://github.com/Thang4869/TriAD-Backend/issues/144):** Viết/chạy baseline checkout và hot-product concurrent scenarios; ghi dataset, máy/CPU/RAM, duration, p50/p95/p99, throughput, conflict/retry/error rate; đặt threshold có thể lặp lại.
- [ ] **[#145 — Mutation testing](https://github.com/Thang4869/TriAD-Backend/issues/145):** Thiết lập mutation runner phù hợp Vitest, giới hạn ban đầu ở Money/Order/Cart/Product và core services; báo cáo surviving mutants, threshold sau baseline và CI artifact.
- [ ] **[#147 — Admin audit](https://github.com/Thang4869/TriAD-Backend/issues/147):** Xác định admin actions; lưu actor/action/target/outcome/request ID không chứa token/PII dư; test authorization, audit write failure, retention và authorized export.
- [~] **[#149 — Release hygiene](https://github.com/Thang4869/TriAD-Backend/issues/149):** Kiểm tra SECURITY/CONTRIBUTING/LICENSE/.env.example/CHANGELOG, onboarding sạch, metadata/topics, thực hiện release/tag dry-run hoặc release thật với SHA và SemVer được xác minh.
- [B] **[#150 — Portfolio/demo](https://github.com/Thang4869/TriAD-Backend/issues/150):** Public HTTPS demo (có thể dùng subdomain miễn phí), protected/static OpenAPI, kiểm tra login→product→cart→checkout và rollback; chỉ đưa test counts, coverage, k6, RTO/RPO vào CV nếu có artifact tái lập.

## Các đầu việc ngang issue vẫn cần xác nhận

- [ ] **G0 / G1:** Rà README và sơ đồ với checkout COD transaction-based, Saga/payment chưa wire vào production; độc lập review claims, README onboarding trong 5 phút và release security metadata.
- [ ] **G2 / G3:** Chạy baseline `any`/type assertions; rà Prisma imports/DI boundaries, JSON Zod validation; kiểm tra persistence hydration/order pricing/cart event semantics, money rounding và invariants chưa phủ. Không thêm interface/pattern khi không giải quyết rủi ro thực.
- [ ] **G4 / G7:** Xác nhận migration với dữ liệu đại diện, outbox→projection trace/log correlation, Grafana dashboard, alert-to-runbook và SLO/burn logic trên môi trường chạy được.
- [B] **G5 / G8:** HTTPS local + proxy/cookie/OAuth + restore rehearsal; staging có thể là Docker local cho production-like, nhưng yêu cầu public demo và kiểm thử đặc thù cloud phải được chứng minh riêng.
- [ ] **G9:** Tạo INTERVIEW_QA/tài liệu tái lập từ bằng chứng thật; chỉ công bố số đo khi runbook/report và commit SHA đối chiếu được.

## Điều kiện đóng mục

Đóng từng mục khi **tất cả acceptance criteria của issue** được kiểm chứng: commit SHA + PR, CI hiện hành PASS, test hoặc runbook có lệnh/môi trường/ngày chạy/kết quả, không làm lộ secrets. Đối với bài chạy local, ghi rõ **local production-like PASS**, không gắn nhãn **deployed staging PASS**. Sau khi đóng, **xóa dòng khỏi checklist này**; lịch sử nằm ở issue/PR.

**Các lệnh kiểm tra code thường dùng:** `npm run typecheck`, `npm run lint`, `npm run architecture:check`, `npm test`, `npm run build` và các workflow CI đang áp dụng. Với các bài load/recovery phải đính kèm artifacts và thiết lập test.

**Nguồn:** [Issues](https://github.com/Thang4869/TriAD-Backend/issues) · [PRs](https://github.com/Thang4869/TriAD-Backend/pulls) · [Actions](https://github.com/Thang4869/TriAD-Backend/actions) · [Frontend](https://github.com/Thang4869/TriAD-12). Các runbook kỹ thuật/ADR vẫn để trong `docs/`, không sao chép tiến độ đã xong vào checklist.
