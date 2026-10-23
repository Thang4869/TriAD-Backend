# TriAD Backend — Work Checklist

**Cập nhật:** 2026-10-23 (đối chiếu code và trình duyệt staging thực tế) · **Phạm vi:** chỉ những việc **chưa xong / đang làm / cần nghiệm thu**. Đây là checklist điều hành duy nhất, không phải báo cáo điểm số. Đã hoàn thành thì xóa dòng khỏi file sau khi có bằng chứng, giữ lịch sử trong GitHub Issues/PRs/Actions.

**Trạng thái:** `[ ]` Chưa hoàn thành · `[~]` Đang làm / đã có code nhưng thiếu nghiệm thu · `[B]` Cần môi trường, dữ liệu hoặc quyết định bổ sung. Không tự chuyển sang hoàn thành chỉ vì CI xanh. Trong lúc chờ staging cloud, có thể thực hiện `production-like` trên máy cá nhân (Docker Compose) và ghi chính xác loại môi trường.

## Làm tiếp — Hoàn tất nghiệm thu staging

**Thứ tự tiếp theo:** refresh/CSRF (#90) → proxy/Redis (#140) → crash/retry (#84) → Compose (#102) → recovery (#143). Chuẩn bị yêu cầu backup/hosting song song; OAuth/PayPal theo các mục riêng sau khi các gate checkout đã đạt.

- [~] **Nghiệm thu môi trường còn lại:** Hoàn tất nghiệm thu refresh/CSRF và cookie bằng phiên HTTPS theo #90; kiểm tra client IP/rate-limit qua Vercel → Render, upload Cloudinary và worker/relay thực tế; chạy các P0 dưới đây. Gói Free chỉ phù hợp thử chức năng, không chứng minh độ bền queue hoặc khả năng chạy worker liên tục. [Bằng chứng staging và giới hạn hiện tại](OPERATIONS.md#deployed-staging-evidence--2026-10-22).

## P0 — Ưu tiên làm trước

- [~] **[#143 — Backup, restore và recovery](https://github.com/Thang4869/TriAD-Backend/issues/143):** Local recovery PASS (`3f4ad02`, 2026-10-19; 9.866s từ backup có sẵn đến HTTP/API ready, không phải production RTO). Issue GitHub hiện đã đóng, nhưng gate deployment này vẫn thiếu bằng chứng. **Còn làm:** xác nhận lịch backup, retention, encryption/off-site/key recovery; phê duyệt và đo RPO thực tế; nghiệm thu BullMQ/Outbox Relay, authenticated API, cutover/rollback và staging deployment. [Evidence/runbook](RECOVERY_DRILL.md).
- [~] **[#140 — Redis + reverse proxy](https://github.com/Thang4869/TriAD-Backend/issues/140):** Dựng proxy local tương đương topology production; thử `TRUST_PROXY`, giả mạo `X-Forwarded-For`, shared NAT, HTTP 429/503, Redis disconnect/reconnect, startup Lua SCRIPT LOAD và health policy; lưu cấu hình, logs và giới hạn môi trường. [Runbook](RATE_LIMIT_STAGING_DRILL.md).
- [~] **[#84 — Checkout crash/retry](https://github.com/Thang4869/TriAD-Backend/issues/84):** Test mất response, kill process và retry cùng idempotency key; so sánh order/stock/Redis lease-owner fencing; khẳng định không nhân đôi order/trừ stock, lưu kịch bản/lệnh/log thực thi. [Runbook](IDEMPOTENCY_RECOVERY.md).
- [~] **[#102 — Production Compose + smoke](https://github.com/Thang4869/TriAD-Backend/issues/102):** Kiểm tra file collector mount/paths, môi trường/secrets, service dependencies và migrations; chạy `docker compose config`, image build, ready/API smoke, SIGTERM trong môi trường sạch. Đối chiếu bằng chứng CI hiện có trước khi đóng; không mặc định CI image smoke đồng nghĩa production Compose đã nghiệm thu.

## P1 — Hoàn thiện code, security và contract

- [ ] **[#141 — Dependency/config](https://github.com/Thang4869/TriAD-Backend/issues/141):** Chạy audit trên lockfile hiện tại, phân loại advisories ở cả prod/dev, xác minh test-only secret không lọt runtime, upload regression, staging Cloudinary/OTLP, lưu quyết định chấp nhận rủi ro có hạn; không dùng số liệu audit cũ như kết quả mới.
- [~] **[#90 — Browser CSRF / origin](https://github.com/Thang4869/TriAD-Backend/issues/90):** Code đã có MAC gắn với phiên, chặn public-login form/Bearer rỗng và giữ token 64-hex tương thích frontend. **Còn nghiệm thu sau review/merge/deploy:** cookie/SameSite/Secure, domain/path, credentials, negative/cross-origin bằng HTTPS; cross-tab và UX trang mở quá hạn. Phân biệt logout revocation lỗi trong controller (đã có HTTP test) với outage upstream theo #140. [Quyết định bảo mật](THREAT_MODEL.md#12-csrf) · [Bằng chứng và bước nghiệm thu](OPERATIONS.md#session-bound-csrf-hardening--2026-10-23). Không chuyển hoàn thành chỉ vì CI xanh.
- [~] **[#146 — DI / composition root](https://github.com/Thang4869/TriAD-Backend/issues/146):** Kiểm tra registration theo module, reuse Auth adapter, request scope có tác dụng hay bỏ, health injection, không service locator; regression tests + architecture/typecheck/lint.
- [~] **[#148 — OpenAPI/FE route](https://github.com/Thang4869/TriAD-Backend/issues/148):** Thêm schema request/response và negative-case contract cho auth/product/cart/checkout/orders; xác định source of truth Zod; chuyển FE sang canonical `/api/orders` nếu còn alias, xác minh FE↔BE E2E trước deprecation.
- [ ] **[#139 — Order read-after-write](https://github.com/Thang4869/TriAD-Backend/issues/139):** Quyết định eventual consistency hay read-your-writes; định nghĩa độ trễ cho phép, bounded authoritative fallback (nếu cần), UI pending state và behavior khi projection lỗi; integration test delay ngay sau checkout.

## OAuth — Google trước, Facebook sau; chuẩn bị tài khoản song song

- [B] **Cấu hình nhà cung cấp:** Tạo Google OAuth web client và Meta App, tài khoản thử/quyền cần thiết; khai báo callback đúng URL đã triển khai và lưu credentials riêng trên hosting. Backend đã có strategy/state/callback; chưa có bằng chứng đăng nhập thật với nhà cung cấp.
- [ ] **Google / frontend:** Thêm nút khởi tạo OAuth, khôi phục user và CSRF sau redirect, trạng thái từ chối/lỗi; hoàn thiện giao diện TOTP và thống nhất yêu cầu 2FA giữa password login và OAuth trước khi bật công khai. Hiện FE chưa có luồng OAuth và chưa hỗ trợ nhập 2FA; OAuth backend đang cấp token trực tiếp.
- [ ] **Facebook / liên kết tài khoản:** Hoàn thiện UX xác minh email, chứng minh quyền sở hữu khi liên kết tài khoản có sẵn; giữ việc từ chối tự liên kết email chưa được xác minh. Nghiệm thu người dùng mới/cũ, email thiếu/chưa xác minh, state hết hạn/replay, cookie, refresh/logout và 2FA.

## P2 — Bằng chứng chất lượng, observability và xuất bản

- [B] **PayPal — chuẩn bị bên ngoài:** Tạo REST app sandbox và tài khoản người mua/người bán thử; lưu credentials riêng. Đăng ký webhook khi đã có endpoint HTTPS thực tế.
- [ ] **PayPal — triển khai sau các P0 checkout:** Hiện chỉ hỗ trợ COD, chưa có PayPal adapter/API. Thiết kế create/capture/refund và trạng thái thanh toán; xác thực chữ ký webhook, idempotency và đối chiếu order/amount/currency; kiểm thử hủy, lỗi/timeout, webhook trùng/đến muộn và không nhân đôi order/trừ stock. Đây là phần cần viết code, không chỉ chờ credentials; chưa tự wire Saga vào runtime khi chưa có bằng chứng end-to-end.
- [ ] **[#144 — k6 contention](https://github.com/Thang4869/TriAD-Backend/issues/144):** Viết/chạy baseline checkout và hot-product concurrent scenarios; ghi dataset, máy/CPU/RAM, duration, p50/p95/p99, throughput, conflict/retry/error rate; đặt threshold có thể lặp lại.
- [ ] **[#145 — Mutation testing](https://github.com/Thang4869/TriAD-Backend/issues/145):** Thiết lập mutation runner phù hợp Vitest, giới hạn ban đầu ở Money/Order/Cart/Product và core services; báo cáo surviving mutants, threshold sau baseline và CI artifact.
- [ ] **[#147 — Admin audit](https://github.com/Thang4869/TriAD-Backend/issues/147):** Xác định admin actions; lưu actor/action/target/outcome/request ID không chứa token/PII dư; test authorization, audit write failure, retention và authorized export.
- [~] **[#149 — Release hygiene](https://github.com/Thang4869/TriAD-Backend/issues/149):** Kiểm tra SECURITY/CONTRIBUTING/LICENSE/.env.example/CHANGELOG, onboarding sạch, metadata/topics, thực hiện release/tag dry-run hoặc release thật với SHA và SemVer được xác minh.
- [B] **[#150 — Portfolio/demo](https://github.com/Thang4869/TriAD-Backend/issues/150):** Public HTTPS demo (có thể dùng subdomain miễn phí), protected/static OpenAPI, kiểm tra login→product→cart→checkout và rollback; chỉ đưa test counts, coverage, k6, RTO/RPO vào CV nếu có artifact tái lập.

## Các đầu việc ngang issue vẫn cần xác nhận

- [ ] **G0 / G1:** Rà README và sơ đồ với checkout COD transaction-based, Saga/payment chưa wire vào production; độc lập review claims, README onboarding trong 5 phút và release security metadata.
- [ ] **G2 / G3:** Chạy baseline `any`/type assertions; rà Prisma imports/DI boundaries, JSON Zod validation; kiểm tra persistence hydration/order pricing/cart event semantics, money rounding và invariants chưa phủ. Không thêm interface/pattern khi không giải quyết rủi ro thực.
- [ ] **G4 / G7:** Xác nhận migration với dữ liệu đại diện, outbox→projection trace/log correlation, Grafana dashboard, alert-to-runbook và SLO/burn logic trên môi trường chạy được.
- [ ] **G9:** Tạo INTERVIEW_QA/tài liệu tái lập từ bằng chứng thật; chỉ công bố số đo khi runbook/report và commit SHA đối chiếu được.

## Điều kiện đóng mục

Đóng từng mục khi **tất cả acceptance criteria của issue** được kiểm chứng: commit SHA + PR, CI hiện hành PASS, test hoặc runbook có lệnh/môi trường/ngày chạy/kết quả, không làm lộ secrets. Đối với bài chạy local, ghi rõ **local production-like PASS**, không gắn nhãn **deployed staging PASS**. Sau khi đóng, **xóa dòng khỏi checklist này**; lịch sử nằm ở issue/PR.

**Các lệnh kiểm tra code thường dùng:** `npm run typecheck`, `npm run lint`, `npm run architecture:check`, `npm test`, `npm run build` và các workflow CI đang áp dụng. Với các bài load/recovery phải đính kèm artifacts và thiết lập test.

**Nguồn:** [Issues](https://github.com/Thang4869/TriAD-Backend/issues) · [PRs](https://github.com/Thang4869/TriAD-Backend/pulls) · [Actions](https://github.com/Thang4869/TriAD-Backend/actions) · [Frontend](https://github.com/Thang4869/TriAD-12). Các runbook kỹ thuật/ADR vẫn để trong `docs/`, không sao chép tiến độ đã xong vào checklist.
