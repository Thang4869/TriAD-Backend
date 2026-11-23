# TriAD Backend — Work Checklist

**Cập nhật:** 2026-11-24 (đối chiếu trạng thái GitHub và bằng chứng vận hành được cung cấp) · **Phạm vi:** chỉ những việc **chưa xong / đang làm / cần nghiệm thu**. Đây là checklist điều hành duy nhất, không phải báo cáo điểm số. Đã hoàn thành thì xóa dòng khỏi file sau khi có bằng chứng, giữ lịch sử trong GitHub Issues/PRs/Actions.

**Trạng thái:** `[ ]` Chưa hoàn thành · `[~]` Đang làm / đã có code nhưng thiếu nghiệm thu · `[B]` Cần môi trường, dữ liệu hoặc quyết định bổ sung. Không tự chuyển sang hoàn thành chỉ vì CI xanh. Trong lúc chờ staging cloud, có thể thực hiện `production-like` trên máy cá nhân (Docker Compose) và ghi chính xác loại môi trường.

## Làm tiếp — Hoàn tất nghiệm thu staging

**Thứ tự tiếp theo:** dependency/config và hosted OTLP acceptance (#141) → release hygiene (#149) → portfolio/demo evidence (#150). Recovery portfolio #143 đã đóng sau khi hoàn tất scope demo miễn phí; các issue đã đóng được theo dõi tại GitHub, không giữ lại trong checklist điều hành này. Proxy/Redis #140, crash/retry #84, production Compose #102 và Cookie/CSRF #90 đã có bằng chứng nghiệm thu; xem OPERATIONS.md.

- [~] **Nghiệm thu môi trường còn lại:** Cookie/CSRF #90 đã nghiệm thu trên HTTPS (5/5 Playwright thực tế, không skipped); Cloudinary upload acceptance passed on 24 Oct; post-cutover Neon encrypted backup và disposable restore đã PASS ngày 21 Nov, #143 đã đóng. Hosted OTLP span proof remains open. Gói Free không chứng minh độ bền Redis queue, worker liên tục, PITR hoặc RTO/RPO được bảo đảm. [Bằng chứng staging và giới hạn hiện tại](OPERATIONS.md#deployed-staging-evidence--2026-10-22).

## Bằng chứng đã nghiệm thu

Đã nghiệm thu/đóng: [Backend #90](https://github.com/Thang4869/TriAD-Backend/issues/90) và [Frontend #23](https://github.com/Thang4869/TriAD-12/issues/23). Source-only cookie/CSRF: backend PR #217–#219; live Render `dep-dbdm9n8ae00c738mhi10` (`d986ced`) và frontend Vercel (`7e345a3`). [Playwright trên HTTPS thật #39967055295](https://github.com/Thang4869/TriAD-12/actions/runs/39967055295) **5/5 PASS, 0 SKIPPED**, cả 3 jobs PASS; nội dung và giới hạn nghiệm thu [ghi tại OPERATIONS.md](OPERATIONS.md#deployed-https-cookie-and-csrf-acceptance--2026-10-23). Bằng chứng gate proxy, Redis outage và nghiệm thu lại cookie sau rollout được ghi trong mục 24/10/2026 tại OPERATIONS.md.

## P1 — Hoàn thiện code, security và contract

- [~] **[#141 — Dependency/config](https://github.com/Thang4869/TriAD-Backend/issues/141):** Config fail-closed merged; latest backend main CI run [#44655433237](https://github.com/Thang4869/TriAD-Backend/actions/runs/44655433237) passed its high/critical dependency gate. This is not evidence of zero vulnerabilities across all severities; the latest all-severity JSON audit has not been reviewed here. Cloudinary staging upload acceptance **PASS 24 Oct**; hosted OTLP receiver/span proof remains outstanding and `ENABLE_TRACING=false` on hosted staging. SMTP delivery and exact-candidate audit evidence remain separate acceptance items. [Audit and limits](DEPENDENCY_SECURITY_AUDIT.md).


## OAuth — Google trước, Facebook sau; chuẩn bị tài khoản song song

- [B] **Cấu hình nhà cung cấp:** Tạo Google OAuth web client và Meta App, tài khoản thử/quyền cần thiết; khai báo callback đúng URL đã triển khai và lưu credentials riêng trên hosting. Backend đã có strategy/state/callback; chưa có bằng chứng đăng nhập thật với nhà cung cấp.
- [ ] **Google / frontend:** Thêm nút khởi tạo OAuth, khôi phục user và CSRF sau redirect, trạng thái từ chối/lỗi; hoàn thiện giao diện TOTP và thống nhất yêu cầu 2FA giữa password login và OAuth trước khi bật công khai. Hiện FE chưa có luồng OAuth và chưa hỗ trợ nhập 2FA; OAuth backend đang cấp token trực tiếp.
- [ ] **Facebook / liên kết tài khoản:** Hoàn thiện UX xác minh email, chứng minh quyền sở hữu khi liên kết tài khoản có sẵn; giữ việc từ chối tự liên kết email chưa được xác minh. Nghiệm thu người dùng mới/cũ, email thiếu/chưa xác minh, state hết hạn/replay, cookie, refresh/logout và 2FA.

## P2 — Bằng chứng chất lượng, observability và xuất bản

- [B] **PayPal — chuẩn bị bên ngoài:** Tạo REST app sandbox và tài khoản người mua/người bán thử; lưu credentials riêng. Đăng ký webhook khi đã có endpoint HTTPS thực tế.
- [ ] **PayPal — triển khai sau các P0 checkout:** Hiện chỉ hỗ trợ COD, chưa có PayPal adapter/API. Thiết kế create/capture/refund và trạng thái thanh toán; xác thực chữ ký webhook, idempotency và đối chiếu order/amount/currency; kiểm thử hủy, lỗi/timeout, webhook trùng/đến muộn và không nhân đôi order/trừ stock. Đây là phần cần viết code, không chỉ chờ credentials; chưa tự wire Saga vào runtime khi chưa có bằng chứng end-to-end.
- [~] **[#149 — Release hygiene](https://github.com/Thang4869/TriAD-Backend/issues/149):** Kiểm tra SECURITY/CONTRIBUTING/LICENSE/.env.example/CHANGELOG, onboarding sạch, metadata/topics, thực hiện release/tag dry-run hoặc release thật với SHA và SemVer được xác minh.
- [B] **[#150 — Portfolio/demo](https://github.com/Thang4869/TriAD-Backend/issues/150):** Public HTTPS demo (có thể dùng subdomain miễn phí), protected/static OpenAPI, kiểm tra login→product→cart→checkout và rollback; chỉ đưa test counts, coverage, k6, RTO/RPO vào CV nếu có artifact tái lập.

## Các đầu việc ngang issue vẫn cần xác nhận

- [ ] **G0 / G1:** Rà README và sơ đồ với checkout COD transaction-based, Saga/payment chưa wire vào production; độc lập review claims, README onboarding trong 5 phút và release security metadata.
- [ ] **G2 / G3:** Chạy baseline `any`/type assertions; rà Prisma imports/DI boundaries, JSON Zod validation; kiểm tra persistence hydration/order pricing/cart event semantics, money rounding và invariants chưa phủ. Không thêm interface/pattern khi không giải quyết rủi ro thực.
- [ ] **G4 / G7:** Xác nhận migration với dữ liệu đại diện, outbox→projection trace/log correlation, Grafana dashboard, alert-to-runbook và SLO/burn logic trên môi trường chạy được.
- [ ] **G9:** Tạo INTERVIEW_QA/tài liệu tái lập từ bằng chứng thật; chỉ công bố số đo khi runbook/report và commit SHA đối chiếu được.

## Điều kiện đóng mục

Chỉ giữ issue còn mở hoặc công việc chưa có acceptance evidence trong checklist. Khi issue đóng, không chép lại vào đây; lịch sử nằm tại issue/PR. Đóng từng mục khi **tất cả acceptance criteria** được kiểm chứng bằng commit SHA, PR, CI hiện hành và bằng chứng test/runbook có môi trường, ngày chạy, kết quả. Với bài chạy local, ghi rõ **local production-like PASS**, không gắn nhãn **deployed staging PASS**.

**Các lệnh kiểm tra code thường dùng:** `npm run typecheck`, `npm run lint`, `npm run architecture:check`, `npm test`, `npm run build` và các workflow CI đang áp dụng. Với các bài load/recovery phải đính kèm artifacts và thiết lập test.

**Nguồn:** [Issues](https://github.com/Thang4869/TriAD-Backend/issues) · [PRs](https://github.com/Thang4869/TriAD-Backend/pulls) · [Actions](https://github.com/Thang4869/TriAD-Backend/actions) · [Frontend](https://github.com/Thang4869/TriAD-12). Các runbook kỹ thuật/ADR vẫn để trong `docs/`, không sao chép tiến độ đã xong vào checklist.
