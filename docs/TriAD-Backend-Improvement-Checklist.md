# TriAD Backend — Work Checklist

**Cập nhật:** 2026-10-24 (đối chiếu code và trình duyệt staging thực tế) · **Phạm vi:** chỉ những việc **chưa xong / đang làm / cần nghiệm thu**. Đây là checklist điều hành duy nhất, không phải báo cáo điểm số. Đã hoàn thành thì xóa dòng khỏi file sau khi có bằng chứng, giữ lịch sử trong GitHub Issues/PRs/Actions.

**Trạng thái:** `[ ]` Chưa hoàn thành · `[~]` Đang làm / đã có code nhưng thiếu nghiệm thu · `[B]` Cần môi trường, dữ liệu hoặc quyết định bổ sung. Không tự chuyển sang hoàn thành chỉ vì CI xanh. Trong lúc chờ staging cloud, có thể thực hiện `production-like` trên máy cá nhân (Docker Compose) và ghi chính xác loại môi trường.

## Làm tiếp — Hoàn tất nghiệm thu staging

**Thứ tự tiếp theo:** recovery (#143) → dependency/config (#141) → order read-after-write (#139). Proxy/Redis #140, crash/retry #84 và production Compose #102 đã có bằng chứng nghiệm thu ngày 24/10/2026; xem mục mới nhất trong OPERATIONS.md. Cookie/CSRF #90 đã nghiệm thu và đóng với bằng chứng thực tế ngày 23/10/2026. Chuẩn bị yêu cầu backup/hosting song song; OAuth/PayPal theo các mục riêng sau khi các gate checkout đã đạt.

- [~] **Nghiệm thu môi trường còn lại:** Cookie/CSRF #90 đã nghiệm thu trên HTTPS (5/5 Playwright thực tế, không skipped); tiếp tục kiểm tra upload Cloudinary và worker/relay thực tế; hoàn tất recovery dưới đây. Gói Free chỉ phù hợp thử chức năng, không chứng minh độ bền queue hoặc khả năng chạy worker liên tục. [Bằng chứng staging và giới hạn hiện tại](OPERATIONS.md#deployed-staging-evidence--2026-10-22).

## P0 — Ưu tiên làm trước

- [~] **[#143 — Recovery portfolio miễn phí](https://github.com/Thang4869/TriAD-Backend/issues/143):** Full-runtime recovery CI đã PASS trong PR #227. Chủ dự án chọn giữ Free, không cam kết RTO/RPO production. Đã chuẩn bị backup PostgreSQL mã hóa về Windows, kiểm tra restore local và lịch Task Scheduler. **Còn làm trên máy cá nhân:** thêm IP /32 vào Render, Setup, giữ key độc lập, chạy backup/restore thật đạt PASS rồi bật lịch và kiểm tra kết quả. Redis Free vẫn mất trạng thái khi restart; PG Free hết hạn 20/11. [Hướng dẫn](PORTFOLIO_BACKUP.md).

Đã nghiệm thu/đóng: [Backend #90](https://github.com/Thang4869/TriAD-Backend/issues/90) và [Frontend #23](https://github.com/Thang4869/TriAD-12/issues/23). Source-only cookie/CSRF: backend PR #217–#219; live Render `dep-dbdm9n8ae00c738mhi10` (`d986ced`) và frontend Vercel (`7e345a3`). [Playwright trên HTTPS thật #39967055295](https://github.com/Thang4869/TriAD-12/actions/runs/39967055295) **5/5 PASS, 0 SKIPPED**, cả 3 jobs PASS; nội dung và giới hạn nghiệm thu [ghi tại OPERATIONS.md](OPERATIONS.md#deployed-https-cookie-and-csrf-acceptance--2026-10-23). Bằng chứng gate proxy, Redis outage và nghiệm thu lại cookie sau rollout được ghi trong mục 24/10/2026 tại OPERATIONS.md.

## P1 — Hoàn thiện code, security và contract

- [ ] **[#141 — Dependency/config](https://github.com/Thang4869/TriAD-Backend/issues/141):** Chạy audit trên lockfile hiện tại, phân loại advisories ở cả prod/dev, xác minh test-only secret không lọt runtime, upload regression, staging Cloudinary/OTLP, lưu quyết định chấp nhận rủi ro có hạn; không dùng số liệu audit cũ như kết quả mới.

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
