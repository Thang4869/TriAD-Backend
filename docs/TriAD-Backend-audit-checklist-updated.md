# TriAD Backend — Audit & Production Readiness Checklist

**Phạm vi:** Backend
[`Thang4869/TriAD-Backend`](https://github.com/Thang4869/TriAD-Backend),
commit `f5a181e` trên `main`; Frontend
[`Thang4869/TriAD-12`](https://github.com/Thang4869/TriAD-12), commit
`84431df` trên `main`. Bản export backend đã được đối chiếu với các file
quan trọng ở repository.

**Đánh giá hiện tại (mang tính tham khảo):** OOP/kiến trúc 8/10; Clean
Code 7/10; khả năng thể hiện trình độ Tech Lead 7/10; sẵn sàng
production 5/10. Có thể dùng dự án trong portfolio/CV với mô tả chính
xác về những gì đã triển khai. Không thể bảo đảm 10/10 chỉ bằng việc
hoàn tất checklist; cần bằng chứng từ test, triển khai và vận hành thực
tế.

Quy ước: **BE** = backend; **FE** = frontend. Các đường dẫn dưới đây là
đường dẫn đầy đủ tới file tương ứng trên GitHub. Mỗi ô là một việc cần
kiểm tra hoặc sửa. Trạng thái bên dưới đã được cập nhật theo các thay
đổi và kiểm thử đã thực hiện đến 01/10/2026.

## Trạng thái nhanh

| Trạng thái               | Ý nghĩa                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| ✅ **CLOSED**            | Code + regression/integration evidence + quality gates cần thiết đã PASS          |
| 🟡 **PARTIAL / PENDING** | Implementation đã có nhưng còn runtime/deployment verification hoặc một phần việc |
| ⬜ **TODO / OPEN**       | Chưa triển khai hoặc chưa có trạng thái đóng                                      |

> **P0 hiện tại:** #1–#11 và #35–#41 đã CLOSED về code/test, bao gồm #36, #37, #38, #39 và #40; #12 vẫn chờ production verification trên Vercel + Render.

## P0 — Production blockers

### #1 — ✅ CLOSED

**Việc cần làm:** Đồng bộ dữ liệu checkout: validator yêu cầu tên và email nhưng controller không gửi, khiến form không qua kiểm tra.

**File liên quan:** [CheckoutValidator.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutValidator.js), [CheckoutController.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutController.js)

### #2 — ✅ CLOSED

**Việc cần làm:** Sửa `paymentStatus: "PAID"` được ghi ngay khi đặt đơn; đơn mới hiện có trạng thái thanh toán `PENDING`.

**File liên quan:** [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)

### #3 — ✅ CLOSED

**Việc cần làm:** Xác định CARD/BANKING đã xử lý; thanh toán thật chưa. Nếu chưa, chỉ mở phương thức được hỗ trợ; nếu có, bổ sung xác nhận, webhook và hoàn tiền.

**File liên quan:** [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), [CheckoutController.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutController.js)

### #4 — ✅ CLOSED

**Việc cần làm:** Làm idempotency an toàn khi DB, đã lưu đơn nhưng Redis hoặc kết nối HTTP lỗi. Gửi lại cùng key phải trả về đơn cũ, không tạo đơn khác hoặc mắc ở trạng thái chờ.

**File liên quan:** [idempotency.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/idempotency.middleware.ts), [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)

### #5 — ✅ CLOSED

**Việc cần làm:** Giữ nguyên idempotency key khi frontend gửi lại cùng một lần đặt hàng; service hiện tạo UUID mới mỗi lần gọi.

**File liên quan:** [CheckoutService.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutService.js)

### #6 — ✅ CLOSED

**Việc cần làm:** Đọc và chốt giá sản phẩm trong transaction checkout. Hiện giỏ được đọc trước transaction, rồi đơn dùng giá từ `cart.items[].product.price`; giá có thể đổi trước khi lưu đơn.

**File liên quan:** [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), [prisma-checkout.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/infrastructure/repositories/prisma-checkout.repository.ts)

### #7 — ✅ CLOSED

**Việc cần làm:** Tạo `orderNumber` bảo đảm không trùng; giá trị hiện dựa vào `Date.now()` và DB có ràng buộc unique.

**File liên quan:** [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma)

### #8 — ✅ CLOSED

**Việc cần làm:** Sửa luồng đổi giá: service phát sự kiện trước khi lưu giá mới. Đưa thao tác lưu và ghi outbox vào cùng transaction.

**File liên quan:** [admin-product.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/services/admin-product.service.ts)

### #9 — ✅ CLOSED

**Việc cần làm:** Đưa sự kiện đổi trạng thái đơn vào outbox và kiểm tra trạng thái bằng cập nhật có điều kiện; hiện cập nhật DB rồi publish trực tiếp, có thể mất sự kiện hoặc gặp hai cập nhật tranh chấp.

**File liên quan:** [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts), [prisma-orders.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/infrastructure/repositories/prisma-orders.repository.ts)

### #10 — ✅ CLOSED

**Việc cần làm:** Không báo outbox thành công khi kiểm tra hoặc ghi kết quả handler thất bại. `recordResult` hiện nuốt lỗi; `EventBus` dùng `Promise.allSettled` nhưng không xử lý mọi promise bị reject.

**File liên quan:** [outbox-handler-tracker.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-handler-tracker.ts), [event-bus.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/event-bus/event-bus.ts)

### #11 — ✅ CLOSED

**Việc cần làm:** Hoàn thiện cấu hình production: compose tham chiếu `otel-collector-config.yml` nhưng file này không có trong repo; chưa truyền đủ biến SMTP/Cloudinary mà cấu hình production yêu cầu.

**File liên quan:** [docker-compose.prod.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/docker-compose.prod.yml), [src/config/index.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/config/index.ts)

### #12 — 🟡 PENDING

**Việc cần làm:** Kiểm chứng cookie và CSRF trên; đúng hai domain triển khai., Frontend đọc `csrfToken` qua `document.cookie`; nếu FE ở `vercel.app` còn API ở `onrender.com`, JavaScript FE không đọc được cookie của API.

**File liên quan:** [api.service.js](https://github.com/Thang4869/TriAD-12/blob/main/src/shared/services/api.service.js), [csrf.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/csrf.middleware.ts), [auth.controller.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/auth.controller.ts)

## P1 — Data correctness, reliability & architecture boundaries

### #13 — ⬜ OPEN

**Việc cần làm:** Định nghĩa "doanh thu" là tiền đã thu hay giá trị đơn; dashboard, hiện cộng cả đơn chưa thanh toán. Đồng bộ quy tắc giữa bảng gốc và projection.

**File liên quan:** [prisma-dashboard.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/admin/dashboard/infrastructure/repositories/prisma-dashboard.repository.ts), [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)

### #14 — ⬜ OPEN

**Việc cần làm:** Quyết định giữ hay bỏ các read, model. Hiện các bảng projection, được cập nhật nhưng `CatalogService`, `OrdersService` và `DashboardService` đều đọc repository bảng gốc; chưa có adapter đọc projection nào được nối vào composition root. Nếu giữ, phải nối adapter và có quy trình rebuild; nếu bỏ, dọn code/tài liệu tương ứng.

**File liên quan:** [container.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts), [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts), [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)

### #15 — ⬜ OPEN

**Việc cần làm:** Phát sự kiện khi tạo sản phẩm và, kiểm tra các thay đổi ảnh hưởng catalog. Hiện `create()` lưu trực tiếp, trong khi dashboard projection đếm sản phẩm từ catalog projection.

**File liên quan:** [admin-product.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/services/admin-product.service.ts), [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)

### #16 — ⬜ OPEN

**Việc cần làm:** Quy định cách xử lý bản ghi, projection cũ, sự kiện phát lặp và thứ tự sự kiện; kiểm thử rebuild sau khi sửa lỗi `PAID`.

**File liên quan:** [projection-handler.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-handler.ts), [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)

### #17 — ⬜ OPEN

**Việc cần làm:** Thống nhất ngưỡng miễn phí vận; chuyển: backend dùng `>` còn frontend hiển thị `>=`. Ngay tại ngưỡng, số tiền hiển thị có thể khác số tiền lưu.

**File liên quan:** [pricing.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/pricing.service.ts), [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)

### #18 — ⬜ OPEN

**Việc cần làm:** Để server trả breakdown giá cuối; cùng và frontend hiển thị theo kết quả server, gồm thuế, phí vận chuyển và giảm giá.

**File liên quan:** [pricing.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/pricing.service.ts), [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)

### #19 — ⬜ OPEN

**Việc cần làm:** Củng cố `Money`: từ chối `NaN`, `Infinity`, số lượng/chỉ số không hợp lệ; thống nhất quy tắc làm tròn và kiểu lưu tiền. Schema hiện dùng `Float`.

**File liên quan:** [money.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/value-objects/money.ts), [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma)

### #20 — ⬜ OPEN

**Việc cần làm:** Sửa `existsAndActive`: tên hàm nói kiểm tra sản phẩm đang hoạt động, nhưng truy vấn hiện chỉ kiểm tra sản phẩm có tồn tại.

**File liên quan:** [prisma-products.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/infrastructure/repositories/prisma-products.repository.ts)

### #21 — ⬜ OPEN

**Việc cần làm:** Bảo đảm tồn kho, giá, trạng thái, `isActive` và số lượng giỏ được xác nhận ở cùng thời điểm đặt hàng; bổ sung ca kiểm tra khi sản phẩm thay đổi trong lúc checkout.

**File liên quan:** [stock-reservation.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/stock-reservation.service.ts), [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)

### #22 — ✅ CLOSED

**Việc cần làm:** Đã kiểm chứng hai yêu cầu refresh đồng thời dùng cùng token và trường hợp refresh trong cùng một giây. Atomic rotation chỉ cho một request thành công; refresh token mới có `jti` để không trùng khi phát hành trong cùng một giây.

**File liên quan:** [token.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/services/token.service.ts), [prisma-auth.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/infrastructure/repositories/prisma-auth.repository.ts), `tests/integration/auth.refresh-token-race.test.ts`

### #23 — ⬜ OPEN

**Việc cần làm:** Kiểm chứng OAuth `state`, callback, liên kết tài khoản và email do provider trả về trước khi dùng như danh tính đã xác minh.

**File liên quan:** [oauth2.strategy.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/strategies/oauth2.strategy.ts), [auth.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/auth.service.ts)

### #24 — ⬜ OPEN

**Việc cần làm:** Chỉ tích hợp Saga khi có adapter, thanh toán và hoàn tiền thật; lúc, đó kiểm thử khôi phục sau crash, chạy lại bước và compensation. Hiện tài liệu xác nhận Saga chưa ở request path production.

**File liên quan:** [checkout.saga.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/application/checkout.saga.ts), [cancellation-refund.saga.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/application/cancellation-refund.saga.ts), [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md)

### #25 — ⬜ OPEN

**Việc cần làm:** Làm rõ cờ `NewCheckoutFlow`: trong `CheckoutService` hiện cờ được ghi vào trace, nhưng không chọn một luồng checkout khác.

**File liên quan:** [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)

### #26 — ⬜ OPEN

**Việc cần làm:** Rà soát việc ghép HTML từ tên sản phẩm; renderer đang chèn `item.name` bằng `innerHTML`. Dùng nút text hoặc escape nội dung.

**File liên quan:** [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)

## P2 — Quality evidence & portfolio readiness

### #27 — ⬜ OPEN

**Việc cần làm:** Viết test checkout frontend dùng validator thật và, payload thật của controller. Test controller hiện mock validator nên không phát hiện lỗi ở mục 1.

**File liên quan:** [CheckoutController.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/unit/modules/checkout/CheckoutController.test.js), [CheckoutValidator.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/unit/modules/checkout/CheckoutValidator.test.js)

### #28 — ⬜ OPEN

**Việc cần làm:** Thay test integration chỉ kiểm tra header tồn tại bằng test thực sự thêm giỏ → đặt đơn → kiểm tra số đơn và giỏ.

**File liên quan:** [checkout.flow.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/integration/checkout.flow.test.js)

### #29 — ⬜ OPEN

**Việc cần làm:** Cập nhật E2E theo form và yêu cầu đăng nhập hiện tại; test đang điền các trường tên/email của luồng cũ.

**File liên quan:** [cart.spec.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/e2e/cart.spec.js)

### #30 — ⬜ OPEN

**Việc cần làm:** Thêm test tích hợp cho retry, khi mất phản hồi, hai checkout đồng thời, đổi giá trong lúc checkout, projection phát lại, Redis lỗi và worker chết giữa xử lý.

**File liên quan:** [checkout.concurrent.test.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/tests/integration/checkout.concurrent.test.ts), [outbox-relay.test.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/tests/unit/core/outbox/outbox-relay.test.ts)

### #31 — ⬜ OPEN

**Việc cần làm:** Cho CI chạy một hành trình; frontend--backend thực trên môi trường test, thay vì chỉ chạy hai bộ test độc lập.

**File liên quan:** [ci.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/ci.yml), [test.yml](https://github.com/Thang4869/TriAD-12/blob/main/.github/workflows/test.yml)

### #32 — ⬜ OPEN

**Việc cần làm:** Chạy thử chính image, production sau build: migration, khởi động, `/health/ready`, checkout và shutdown. CI hiện build image nhưng chưa chứng minh image chạy được với cấu hình production.

**File liên quan:** [Dockerfile](https://github.com/Thang4869/TriAD-Backend/blob/main/Dockerfile), [ci.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/ci.yml)

### #33 — ⬜ OPEN

**Việc cần làm:** Thử phục hồi từ backup, replay outbox và rebuild projection; ghi thời gian khôi phục và kết quả vào runbook.

**File liên quan:** [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md)

### #34 — ⬜ OPEN

**Việc cần làm:** Cập nhật README bằng sơ đồ, đúng với luồng đang chạy, giới hạn thanh toán hiện tại, cách chạy đầy đủ FE+BE và bằng chứng test/deploy.

**File liên quan:** [README.md](https://github.com/Thang4869/TriAD-Backend/blob/main/README.md), [ARCHITECTURE.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/ARCHITECTURE.md)

## Tiến độ cập nhật 01/10/2026

- **P0 đã CLOSED chắc chắn trên code/test:** #1–#11 và #35–#41. Riêng chuỗi #36 → #40 đều đã PASS và CLOSED.
- **P0 #12:** 🟡 **IMPLEMENTATION COMPLETE / PRODUCTION VERIFICATION PENDING** --- code, regression tests và quality gates đã hoàn tất; còn chờ kiểm chứng trên đúng hai domain Vercel + Render sau khi deploy.
- **#39:** content validation bằng `sharp` và cleanup static `/uploads` legacy đã hoàn tất; typecheck/lint/unit test PASS.
- **#40:** global body limit `100kb` + HTTP `413` handling đã hoàn tất; typecheck/lint/unit test PASS.
- Một mục chỉ được chuyển sang **CLOSED** khi thay đổi mã nguồn,
  regression/integration test liên quan và quality gates cần thiết đều
  PASS.
- #8 đã có integration evidence cho cả hai nhánh: cập nhật giá +
  outbox cùng commit; nếu persistence outbox thất bại thì transaction
  rollback và giá cũ được giữ nguyên.

### Bằng chứng bổ sung --- P0 #10 và #11 (30/09/2026)

- **#10 --- CLOSED:** `recordResult()` ném lại lỗi ghi tracker;
  `EventBus.publish()` tổng hợp mọi promise bị reject thành
  `failedHandlers`, bao gồm lỗi kiểm tra và ghi kết quả handler. Đã bổ
  sung ba trường hợp lỗi tracker và kiểm tra handler khác vẫn chạy.
  Người dùng xác nhận typecheck, lint và các test
  EventBus/tracker/relay PASS.
- **#11 --- CLOSED trong phạm vi cấu hình và khởi động Docker
  production trên máy local:**
  - Compose truyền các biến frontend/CORS, SMTP và Cloudinary bắt
    buộc; file secret không đưa vào commit.
  - Tạo `otel-collector-config.yml`, mount read-only; Collector
    validate thành công, không publish cổng nhận trace ra host.
  - Dockerfile dùng Node 22 trên Debian bookworm-slim, cài OpenSSL
    và cấp quyền `/app/logs` cho user không phải root. Image build
    thành công.
  - Tạo database kiểm tra riêng `triad_prod_check` trên PostgreSQL
    hiện có; cả 8 migration đã áp dụng thành công.
  - Tách Redis bằng service `redis-prod-check` và volume riêng,
    tránh xử lý lại hàng đợi thử nghiệm cũ.
  - Container API `healthy`, `/health/ready` trả `up`; log xác nhận
    PostgreSQL, Redis, BullMQ và OutboxRelay khởi động. Log sau khi
    tách môi trường không còn xử lý đơn thử nghiệm cũ.
  - Phạm vi giới hạn: kiểm chứng trên Docker Desktop, vẫn sử dụng
    PostgreSQL đã có trong cùng project; chưa chứng minh compose
    khởi động độc lập trên máy sạch, triển khai public, luồng upload
    Cloudinary hoặc email end-to-end có kiểm soát. OTEL dùng debug
    exporter, chưa có nơi lưu/tra cứu trace lâu dài và chưa xác minh
    trace end-to-end.
  - Lần chạy trước khi tách môi trường đã xử lý outbox thử nghiệm
    bằng SMTP thật; không coi đó là kiểm thử email có kiểm soát.
- **#9 --- CLOSED:** `OrdersService.updateOrderStatus` dùng
  conditional update theo `version`, tăng version khi cập nhật;
  `OrderStatusChanged` được ghi vào outbox trong cùng Prisma
  transaction. Request dùng version cũ bị conflict; nếu ghi outbox
  thất bại thì status/version rollback. Unit/integration tests,
  typecheck và lint đều PASS; thay đổi đã được commit.

### Bằng chứng bổ sung --- P0 #35 / A3 (01/10/2026)

- **#35 / A3 --- CLOSED:**
  - `PrismaCheckoutRepository.runInTransaction()` bắt Prisma `P2034` tại adapter và dịch thành `ConflictError` trước khi trả lỗi về `CheckoutService`.
  - `CheckoutService.executeWithRetry()` giữ exponential backoff và đã bổ sung jitter để giảm retry đồng nhịp khi có contention.
  - Unit test xác minh retry + jitter; adapter test xác minh `P2034` → `ConflictError`.
  - `tests/integration/checkout.concurrent.test.ts` không còn mock `executeWithRetry()`; test tạo hai transaction PostgreSQL `Serializable` cùng đọc rồi cạnh tranh ghi, xác minh một transaction thành công và transaction còn lại được dịch thành `ConflictError`.
  - Người dùng xác nhận các bước kiểm thử liên quan PASS.

### Bằng chứng bổ sung --- P0 #37 / B1 (01/10/2026)

- **#37 / B1 --- CLOSED:**
  - `revokeRefreshToken()` dùng conditional update theo `revokedAt IS NULL`; chỉ request đầu tiên có thể claim token.
  - `rotateRefreshToken()` thực hiện revoke token cũ + create token mới trong cùng Prisma transaction.
  - Nếu create token mới thất bại, transaction rollback và token cũ vẫn có `revokedAt = null`.
  - Refresh JWT mới có `jti`, tránh tạo token trùng khi rotation xảy ra trong cùng một giây.
  - Concurrent `TokenService.refreshToken()` integration test với PostgreSQL thật xác minh chỉ một request thành công.
  - Unit tests, integration tests, typecheck và lint đều PASS.

### Bằng chứng bổ sung --- P0 #12 (01/10/2026)

- **#12 --- IMPLEMENTATION COMPLETE / PRODUCTION VERIFICATION PENDING:**
  - Frontend không còn phụ thuộc `document.cookie` để đọc CSRF cookie của API cross-site.
  - Login, refresh, verify-email và verify-TOTP nhận CSRF token từ response backend; logout xoá token phía frontend.
  - Backend có authenticated `GET /auth/csrf`; frontend bootstrap dùng endpoint này để phục hồi CSRF token sau reload và sau OAuth redirect.
  - Production CORS dùng allowlist và `credentials: true`.
  - `COOKIE_DOMAIN` đã được đưa vào validated config; với `*.vercel.app` + `*.onrender.com` phải để unset để cookie backend là host-only.
  - Frontend regression tests và production build PASS. Backend 95/95 test files, 887/887 tests, typecheck và lint PASS.
  - Chưa CLOSED vì dự án chưa deploy Vercel + Render; cần smoke test cookie/CORS/CSRF trên hai domain thật ở deployment phase.

## Thứ tự thực hiện

1.  **#39/B8 và #40/B5 đã CLOSED.** Commit/push nhóm thay đổi security/cleanup hiện tại.
2.  **#12** giữ trạng thái production-verification pending cho giai đoạn deploy Vercel + Render.
3.  Chuyển sang **P1 #14 / C1**: quyết định giữ hay bỏ projection/read-model. Đây là dependency cho #13 và nhiều mục #42--#47.
4.  Tiếp tục #42--#55 theo dependency sau khi C1 được chốt.
5.  Thực hiện P2 và các diễn tập runtime/E2E để chứng minh hành vi
    production, recovery và CI.
6.  Đánh giá lại OOP, Clean Code, Tech Lead và production readiness dựa
    trên code + test + deploy evidence; không suy ra điểm tuyệt đối chỉ
    từ số checkbox đã đóng.

**Tiêu chí hoàn thành:** khách đặt được đơn từ frontend; dữ liệu tiền,
trạng thái và tồn kho nhất quán khi có lỗi hoặc yêu cầu đồng thời; CI
xanh; image production khởi động được; có bằng chứng khôi phục sau sự
cố. Đạt đủ các tiêu chí này sẽ cải thiện đánh giá rõ rệt, nhưng không có
cam kết điểm tuyệt đối 10/10.

## Bổ sung sau khi đối chiếu checklist đánh giá thứ hai

Nguồn đối chiếu: `TriAD-Backend-Improvement-Checklist.md` do người dùng
cung cấp. Tài liệu đó xem bản export cũ 309 file và chưa xem một số file
cấu hình; các mục dưới đây đã được đối chiếu lại với repository backend
`main` commit `f5a181e` tại thời điểm rà soát trước nhóm thay đổi #39/#40. Những việc trùng với mục 1--34 được giữ ở vị
trí cũ, không tạo mục trùng. Các mục chưa kiểm thử runtime được diễn đạt
là **kiểm chứng**.

### P0 bổ sung — Transaction & access risks

### #35 — ✅ CLOSED

**Việc cần làm:** Dịch `P2034`/serialization conflict từ Prisma thành lỗi retryable ngay trong adapter trước khi trả lỗi về `CheckoutService`; `CheckoutService` retry bằng exponential backoff + jitter và có contention test thật trên PostgreSQL `Serializable`.

**File liên quan:** [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), [prisma-checkout.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/infrastructure/repositories/prisma-checkout.repository.ts), [prisma-error-classifier.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/database/prisma-error-classifier.ts)

### #36 — ✅ CLOSED

**Việc cần làm:** Bắt lỗi Redis trong middleware async của Express 4 và chuyển qua `next(error)`; dùng TTL ngắn cho `IN_PROGRESS` và cơ chế khôi phục khi process chết. Redis failures trước response được chuyển sang error middleware; lỗi ghi/xóa cache sau response được log để quan sát.

**File liên quan:** [idempotency.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/idempotency.middleware.ts), [src/config/index.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/config/index.ts)

### #37 — ✅ CLOSED

**Việc cần làm:** Refresh-token rotation đã được chuyển sang thao tác atomic. Repository chỉ revoke token khi `revokedAt IS NULL`; revoke token cũ và tạo token mới nằm trong cùng Prisma transaction. Hai request refresh đồng thời với cùng token chỉ cho phép một request thành công. Refresh token mới có `jti` để bảo đảm uniqueness ngay cả khi rotate trong cùng một giây; nếu tạo token mới thất bại thì transaction rollback và token cũ vẫn active.

**File liên quan:** [token.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/services/token.service.ts), [auth.repository.port.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/application/ports/auth.repository.port.ts), [prisma-auth.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/infrastructure/repositories/prisma-auth.repository.ts), `tests/integration/auth.refresh-token-race.test.ts`, `tests/integration/auth.repository.test.ts`, `tests/unit/modules/auth/token.service.test.ts`

**Evidence:** concurrent refresh race test PASS; repository atomic-claim test PASS; rollback integration test PASS; unit tests, typecheck và lint PASS.

### #38 — ✅ CLOSED

**Việc đã làm:** `/metrics` và `/api/docs` chỉ được mount khi `!config.isProduction`. Ở production hai route rơi xuống `notFoundHandler` và trả `404`; development/test vẫn giữ quyền truy cập.

**Evidence:** có integration test production-route cho cả `/metrics` và `/api/docs`; typecheck/lint/test liên quan PASS. Thay đổi đã có trên GitHub qua commit `cc8eb56` (`fix(security): protect metrics and api docs in production`).

**File liên quan:** [app.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/app.ts), [metrics.routes.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/metrics/metrics.routes.ts), `tests/integration/production-routes.test.ts`

### #39 — ✅ CLOSED

**Việc đã làm:** upload không còn chỉ tin `mimetype` do client gửi. Sau Multer, `validateUploadedImage` dùng `sharp(...).metadata()` để giải mã/nhận diện nội dung thật và chỉ chấp nhận `jpeg`, `png`, `webp`. Fake image/unsupported format bị từ chối bằng `BadRequestError`.

Static route `/uploads` và thư mục `uploads/tmp` legacy đã được loại bỏ sau khi xác nhận frontend không còn consumer và luồng ảnh hiện dùng `CloudinaryImageStorage`.

**Evidence:** unit tests upload middleware, typecheck và lint PASS; tìm kiếm runtime reference không còn `/uploads`.

**File liên quan:** [upload.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/upload.middleware.ts), [products.routes.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/products.routes.ts), [app.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/app.ts), `tests/unit/shared/middlewares/upload.middleware.test.ts`

### #40 — ✅ CLOSED

**Việc đã làm:** global JSON/urlencoded body limit đã giảm từ `10mb` xuống `100kb`. Upload ảnh không bị ảnh hưởng vì dùng `multipart/form-data` qua Multer với giới hạn riêng `5MB`. Error handler nhận diện `entity.too.large` và trả HTTP `413` với message `Request payload too large`.

**Evidence:** unit test cho error handler, typecheck và lint PASS. #40 được xác nhận CLOSED.

**File liên quan:** [app.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/app.ts), [error-handler.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/error-handler.middleware.ts), `tests/unit/shared/middlewares/error-handler.middleware.test.ts`

### #41 — ✅ CLOSED

**Việc cần làm:** Sửa đầy đủ snapshot, projection: ngoài `paymentStatus`, code còn đặt `tax = 0`, `shippingFee = 0`, `subtotal = total`, `placedAt = new Date()`. Bổ sung dữ liệu event cần thiết hoặc đọc snapshot từ đơn gốc; dùng thời điểm event và backfill dữ liệu sai hiện có.

**File liên quan:** [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts), [order-events.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/events/order-events.ts)

### P1 bổ sung — Outbox, domain & architecture

### #42 — ⬜ OPEN

**Việc cần làm:** Kiểm chứng thứ tự sự kiện của, cùng aggregate khi nhiều relay claim song song; nếu người đọc phụ thuộc thứ tự, thêm quy tắc claim theo aggregate hoặc version.

**File liên quan:** [prisma-outbox-relay.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-outbox-relay.store.ts), [projection-handler.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-handler.ts)

### #43 — ⬜ OPEN

**Việc cần làm:** Kiểm chứng batch 50 event xử lý, tuần tự có thể vượt lease 60 giây; nếu có, gia hạn lease/heartbeat hoặc claim theo batch nhỏ. Đo bằng handler chậm và hai relay.

**File liên quan:** [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts), [prisma-outbox-relay.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-outbox-relay.store.ts)

### #44 — ⬜ OPEN

**Việc cần làm:** Đo lag từ event chưa publish cũ, nhất và theo dõi dead-letter riêng. Hiện gauge trả về 0 khi batch claim rỗng, kể cả lúc event đang chờ retry/backoff.

**File liên quan:** [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts), [metrics.registry.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/metrics/metrics.registry.ts)

### #45 — ⬜ OPEN

**Việc cần làm:** Đưa lỗi handler vào callback, `withRetry` hoặc bỏ retry ngay tại chỗ và dựa vào outbox retry. Hiện `eventBus.publish()` trả `{success:false}` nên `withRetry()` không retry trường hợp handler trả thất bại; lỗi chỉ được ném sau khi callback kết thúc.

**File liên quan:** [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts), [event-bus.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/event-bus/event-bus.ts)

### #46 — ⬜ OPEN

**Việc cần làm:** Có đường vận hành để replay, dead-letter và dọn event đã, publish sau thời gian lưu giữ; xác nhận index claim và cơ chế chống side effect lặp.

**File liên quan:** [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts), [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md), [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma)

### #47 — ⬜ OPEN

**Việc cần làm:** Định phiên bản và kiểm tra, payload outbox trước khi dispatch; hiện `deserializeDomainEvent()` ép `unknown` thành `DomainEvent` và chỉ kiểm tra là object.

**File liên quan:** [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts), [domain-event.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/events/domain-event.ts)

### #48 — ⬜ OPEN

**Việc cần làm:** Cập nhật trạng thái đơn qua hành, vi aggregate hoặc quy tắc domain thống nhất, lưu cùng version và outbox. `OrdersService` hiện kiểm tra bằng `Order.canTransition()` rồi ghi status trực tiếp, nên có nguy cơ tranh chấp giữa hai request.

**File liên quan:** [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts), [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)

### #49 — ⬜ OPEN

**Việc cần làm:** Tách version dùng để kiểm soát, đồng thời khỏi bộ đếm event: `AggregateRoot.raise()` hiện tự tăng version mỗi khi tạo sự kiện. Nếu version này đi xuống DB, phải định nghĩa rõ lúc hydrate và lúc update.

**File liên quan:** [aggregate-root.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/aggregate-root.ts), [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)

### #50 — ⬜ OPEN

**Việc cần làm:** Quy định đường đi hợp lệ tới, `REFUNDED` và trạng thái thanh toán sau refund, hoặc loại status này nếu không dùng. Hiện bảng transition không có cạnh đi vào `REFUNDED`.

**File liên quan:** [order-status.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order-status.ts), [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)

### #51 — ⬜ OPEN

**Việc cần làm:** Giữ invariant của `OrderItem` khi thêm lại cùng sản phẩm: hiện `addItem()` cộng số lượng nhưng âm thầm thay giá của toàn bộ dòng bằng `unitPrice` mới.

**File liên quan:** [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)

### #52 — ⬜ OPEN

**Việc cần làm:** Kiểm tra việc cùng phát, `OrderStatusChangedEvent` và `OrderCancelledEvent` khi hủy đơn; xác định rõ mỗi handler nghe event nào để tránh thực hiện hai lần một tác dụng.

**File liên quan:** [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts), [order-events.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/events/order-events.ts)

### #53 — ⬜ OPEN

**Việc cần làm:** Thêm kiểm tra ranh giới phụ, thuộc trong CI, tập trung vào module domain/application không import adapter hạ tầng; sửa từng vi phạm thực tế, tránh tạo interface cho mọi class chỉ để tăng điểm OOP.

**File liên quan:** [ci.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/ci.yml), [container.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts)

### #54 — ⬜ OPEN

**Việc cần làm:** Rà soát `src/core/unit-of-work/`, rỗng và claim Unit of Work trong README: triển khai transaction boundary qua port rõ ràng nếu thực sự cần, hoặc mô tả thẳng transaction Prisma hiện dùng.

**File liên quan:** [README.md](https://github.com/Thang4869/TriAD-Backend/blob/main/README.md), [checkout-transaction.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/application/ports/checkout-transaction.ts)

### #55 — ⬜ OPEN

**Việc cần làm:** Đưa hai kiểu lỗi, domain/application và HTTP về một quy tắc ánh xạ dễ kiểm chứng. Hiện service còn import `BadRequestError` trong khi `AppError` thuộc middleware.

**File liên quan:** [errors.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/utils/errors.ts), [error-handler.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/error-handler.middleware.ts)

### P2 bổ sung — Runtime, testing & documentation

### #56 — ⬜ OPEN

**Việc cần làm:** Bổ sung test tích hợp thật cho outbox nhiều relay, idempotency, với Redis và race refresh token; test unit/mock không chứng minh được hành vi khi crash hoặc tranh chấp.

**File liên quan:** [tests/integration/checkout.concurrent.test.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/tests/integration/checkout.concurrent.test.ts), [quality-gates.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/quality-gates.yml)

### #57 — ⬜ OPEN

**Việc cần làm:** Sửa dev Compose đang mount, `./nodemon.json` không có trong repo; kiểm tra lại lệnh dev và biến `QUEUE_REDIS_URL` có được đọc hay không.

**File liên quan:** [docker-compose.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/docker-compose.yml), [package.json](https://github.com/Thang4869/TriAD-Backend/blob/main/package.json)

### #58 — ⬜ OPEN

**Việc cần làm:** Xem xét tách worker BullMQ và, relay khỏi tiến trình HTTP khi cần scale độc lập; hiện `server.ts` khởi động cả ba. Trước khi tách, đo tải và quyết định topology.

**File liên quan:** [server.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/server.ts), [bull.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/queue/bull.ts)

### #59 — ⬜ OPEN

**Việc cần làm:** Đồng bộ README với code: sửa, `/api-docs` thành `/api/docs`, claim CQRS/Unit of Work/Strategy và các ADR trùng số; giữ phần ghi rõ Saga chưa ở production, bỏ mô tả "Internal / Private" nếu repo vẫn public.

**File liên quan:** [README.md](https://github.com/Thang4869/TriAD-Backend/blob/main/README.md), [ARCHITECTURE.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/ARCHITECTURE.md)

### #60 — ⬜ OPEN

**Việc cần làm:** Dọn thông báo lỗi trỏ tới, `prisma/schema.additions.prisma` không tồn tại; xem lại dependency `@prisma/adapter-pg` 7.x đang nằm cạnh `prisma`/`@prisma/client` 5.x và chỉ giữ package thực dùng.

**File liên quan:** [persist-domain-events.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/persist-domain-events.ts), [package.json](https://github.com/Thang4869/TriAD-Backend/blob/main/package.json)

### Nhận định cần sửa hoặc chưa đủ căn cứ trong checklist đánh giá thứ hai

- **Coverage chưa có ngưỡng** là sai:
  [`vitest.unit.config.mts`](https://github.com/Thang4869/TriAD-Backend/blob/main/vitest.unit.config.mts)
  đã đặt ngưỡng 90% và 100% cho domain/value objects. Có thể tăng chất
  lượng bài test, nhưng không thêm việc "bật ngưỡng" như thể còn
  thiếu.
- **Resend verification chưa có rate limiter** là sai:
  [`auth.routes.ts`](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/auth.routes.ts)
  đã gắn `authRateLimiter`.
- **Hai file `container.ts` là duplicate** là sai:
  [`src/core/di/container.ts`](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/di/container.ts)
  triển khai cơ chế container;
  [`src/container.ts`](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts)
  đăng ký dependency. Có thể chia nhỏ composition root, không nên xóa
  một file theo tên.
- **Port/Strategy/State pattern ở mọi nơi, mọi module đều thành
  aggregate** là yêu cầu quá mức. Chỉ áp dụng khi có nhiều biến thể
  hoặc invariant cần bảo vệ; một codebase nhiều abstraction không tự
  động đạt điểm OOP cao.
- **Mọi domain event đều phải qua outbox** là diễn đạt quá rộng. Bắt
  buộc tính bền vững cho các event có side effect hoặc cần xử lý sau
  commit; event nội bộ thuần đồng bộ có thể giữ trong process nếu phạm
  vi được ghi rõ. Lỗi hiện có là các luồng phát event sau khi lưu DB
  nhưng không có cơ chế bền vững.
- **Port production mặc định 5000 trong Docker Compose** không phải
  lỗi: compose đã đặt `PORT=3000` và map `3000:3000`. Lỗi thực tế là
  thiếu cấu hình và file được mount.
- **Đảm bảo 9--10/10 sau checklist** không có cơ sở kiểm chứng. Thành
  công phải được đo bằng luồng end-to-end, dữ liệu đúng, triển khai
  hoạt động và khả năng phục hồi; đánh giá cuối vẫn phụ thuộc môi
  trường và người review.

**Cập nhật thứ tự thực hiện:** P0 mục 1--12 và 35--41; tiếp đến 14,
42--55 cùng các mục P1 liên quan; sau cùng chạy các test và diễn tập P2.
Các mục an ninh hoặc package phụ thuộc phiên bản hiện hành cần tra
advisory và chạy kiểm chứng trước khi nâng cấp.
