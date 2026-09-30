# Checklist hoàn thiện TriAD Backend và kết nối Frontend

**Phạm vi:** Backend
[`Thang4869/TriAD-Backend`](https://github.com/Thang4869/TriAD-Backend),
commit `bc23f66` trên `main`; Frontend
[`Thang4869/TriAD-12`](https://github.com/Thang4869/TriAD-12), commit
`9800494` trên `main`. Bản export backend đã được đối chiếu với các file
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
đổi và kiểm thử đã thực hiện đến 30/09/2026.

## P0 --- Sửa trước khi xem là production

---

\# Việc cần làm File Trạng
thái

---

1 Đồng bộ dữ liệu checkout: FE: [CheckoutValidator.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutValidator.js), ✅
validator yêu cầu tên và email [CheckoutController.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutController.js) CLOSED
nhưng controller không gửi,  
khiến form không qua kiểm tra.

2 Sửa `paymentStatus: "PAID"` BE: [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts) ✅
được ghi ngay khi đặt đơn; đơn CLOSED
mới hiện có trạng thái thanh  
toán `PENDING`.

3 Xác định CARD/BANKING đã xử lý BE: [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts); FE: ✅
thanh toán thật chưa. Nếu chưa, [CheckoutController.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutController.js) CLOSED
chỉ mở phương thức được hỗ trợ;  
nếu có, bổ sung xác nhận,  
webhook và hoàn tiền.

4 Làm idempotency an toàn khi DB BE: [idempotency.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/idempotency.middleware.ts), ✅
đã lưu đơn nhưng Redis hoặc kết [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts) CLOSED
nối HTTP lỗi. Gửi lại cùng key  
phải trả về đơn cũ, không tạo  
đơn khác hoặc mắc ở trạng thái  
chờ.

5 Giữ nguyên idempotency key khi FE: [CheckoutService.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutService.js) ✅
frontend gửi lại cùng một lần CLOSED
đặt hàng; service hiện tạo UUID  
mới mỗi lần gọi.

6 Đọc và chốt giá sản phẩm trong BE: [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), ✅
transaction checkout. Hiện giỏ [prisma-checkout.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/infrastructure/repositories/prisma-checkout.repository.ts) CLOSED
được đọc trước transaction, rồi  
đơn dùng giá từ  
`cart.items[].product.price`;  
giá có thể đổi trước khi lưu  
đơn.

7 Tạo `orderNumber` bảo đảm không BE: [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), ✅
trùng; giá trị hiện dựa vào [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma) CLOSED
`Date.now()` và DB có ràng buộc  
unique.

8 Sửa luồng đổi giá: service phát BE: [admin-product.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/services/admin-product.service.ts) ✅
sự kiện trước khi lưu giá mới. CLOSED
Đưa thao tác lưu và ghi outbox  
vào cùng transaction.

9 Đưa sự kiện đổi trạng thái đơn BE: [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts), ✅
vào outbox và kiểm tra trạng [prisma-orders.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/infrastructure/repositories/prisma-orders.repository.ts) CLOSED
thái bằng cập nhật có điều  
kiện; hiện cập nhật DB rồi  
publish trực tiếp, có thể mất  
sự kiện hoặc gặp hai cập nhật  
tranh chấp.

10 Không báo outbox thành công khi BE: [outbox-handler-tracker.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-handler-tracker.ts), ✅
kiểm tra hoặc ghi kết quả [event-bus.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/event-bus/event-bus.ts) CLOSED
handler thất bại.  
`recordResult` hiện nuốt lỗi;  
`EventBus` dùng  
`Promise.allSettled` nhưng  
không xử lý mọi promise bị  
reject.

11 Hoàn thiện cấu hình production: BE: [docker-compose.prod.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/docker-compose.prod.yml), ✅
compose tham chiếu [src/config/index.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/config/index.ts) CLOSED
`otel-collector-config.yml`  
nhưng file này không có trong  
repo; chưa truyền đủ biến  
SMTP/Cloudinary mà cấu hình  
production yêu cầu.

12 Kiểm chứng cookie và CSRF trên FE: [api.service.js](https://github.com/Thang4869/TriAD-12/blob/main/src/shared/services/api.service.js); BE: 🟡 IMPLEMENTATION COMPLETE --- production verification pending
đúng hai domain triển khai. [csrf.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/csrf.middleware.ts),  
Frontend đọc `csrfToken` qua [auth.controller.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/auth.controller.ts)  
`document.cookie`; nếu FE ở  
`vercel.app` còn API ở  
`onrender.com`, JavaScript FE  
không đọc được cookie của API.
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## P1 --- Đúng dữ liệu, độ tin cậy và ranh giới kiến trúc

---

\# Việc cần làm File

---

13 Định nghĩa "doanh thu" là tiền đã BE:
thu hay giá trị đơn; dashboard [prisma-dashboard.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/admin/dashboard/infrastructure/repositories/prisma-dashboard.repository.ts),
hiện cộng cả đơn chưa thanh toán. [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)
Đồng bộ quy tắc giữa bảng gốc và  
projection.

14 Quyết định giữ hay bỏ các read BE: [container.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts),
model. Hiện các bảng projection [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts),
được cập nhật nhưng [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)
`CatalogService`, `OrdersService`
và `DashboardService` đều đọc  
repository bảng gốc; chưa có  
adapter đọc projection nào được  
nối vào composition root. Nếu  
giữ, phải nối adapter và có quy  
trình rebuild; nếu bỏ, dọn  
code/tài liệu tương ứng.

15 Phát sự kiện khi tạo sản phẩm và BE: [admin-product.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/services/admin-product.service.ts),
kiểm tra các thay đổi ảnh hưởng [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)
catalog. Hiện `create()` lưu trực
tiếp, trong khi dashboard  
projection đếm sản phẩm từ  
catalog projection.

16 Quy định cách xử lý bản ghi BE: [projection-handler.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-handler.ts),
projection cũ, sự kiện phát lặp [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)
và thứ tự sự kiện; kiểm thử  
rebuild sau khi sửa lỗi `PAID`.

17 Thống nhất ngưỡng miễn phí vận BE: [pricing.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/pricing.service.ts); FE:
chuyển: backend dùng `>` còn [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)
frontend hiển thị `>=`. Ngay tại  
ngưỡng, số tiền hiển thị có thể  
khác số tiền lưu.

18 Để server trả breakdown giá cuối BE: [pricing.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/pricing.service.ts); FE:
cùng và frontend hiển thị theo [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)
kết quả server, gồm thuế, phí vận
chuyển và giảm giá.

19 Củng cố `Money`: từ chối `NaN`, BE: [money.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/value-objects/money.ts),
`Infinity`, số lượng/chỉ số không [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma)
hợp lệ; thống nhất quy tắc làm  
tròn và kiểu lưu tiền. Schema  
hiện dùng `Float`.

20 Sửa `existsAndActive`: tên hàm BE: [prisma-products.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/infrastructure/repositories/prisma-products.repository.ts)
nói kiểm tra sản phẩm đang hoạt  
động, nhưng truy vấn hiện chỉ  
kiểm tra sản phẩm có tồn tại.

21 Bảo đảm tồn kho, giá, trạng thái BE: [stock-reservation.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/stock-reservation.service.ts),
`isActive` và số lượng giỏ được [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)
xác nhận ở cùng thời điểm đặt  
hàng; bổ sung ca kiểm tra khi sản
phẩm thay đổi trong lúc checkout.

22 Kiểm chứng hai yêu cầu refresh BE: [token.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/services/token.service.ts)
đồng thời dùng cùng token và  
trường hợp refresh trong cùng một
giây; bảo đảm rotation chỉ tạo  
một kết quả hợp lệ.

23 Kiểm chứng OAuth `state`, BE: [oauth2.strategy.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/strategies/oauth2.strategy.ts),
callback, liên kết tài khoản và [auth.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/auth.service.ts)
email do provider trả về trước  
khi dùng như danh tính đã xác  
minh.

24 Chỉ tích hợp Saga khi có adapter BE: [checkout.saga.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/application/checkout.saga.ts),
thanh toán và hoàn tiền thật; lúc [cancellation-refund.saga.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/application/cancellation-refund.saga.ts),
đó kiểm thử khôi phục sau crash, [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md)
chạy lại bước và compensation.  
Hiện tài liệu xác nhận Saga chưa  
ở request path production.

25 Làm rõ cờ `NewCheckoutFlow`: BE: [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)
trong `CheckoutService` hiện cờ  
được ghi vào trace, nhưng không  
chọn một luồng checkout khác.

26 Rà soát việc ghép HTML từ tên sản FE: [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)
phẩm; renderer đang chèn  
`item.name` bằng `innerHTML`.  
Dùng nút text hoặc escape nội  
dung.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## P2 --- Chứng minh chất lượng và nâng mức portfolio

---

\# Việc cần làm File

---

27 Viết test checkout frontend FE:
dùng validator thật và [CheckoutController.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/unit/modules/checkout/CheckoutController.test.js),
payload thật của controller. [CheckoutValidator.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/unit/modules/checkout/CheckoutValidator.test.js)
Test controller hiện mock  
validator nên không phát  
hiện lỗi ở mục 1.

28 Thay test integration chỉ FE: [checkout.flow.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/integration/checkout.flow.test.js)
kiểm tra header tồn tại bằng
test thực sự thêm giỏ → đặt  
đơn → kiểm tra số đơn và  
giỏ.

29 Cập nhật E2E theo form và FE: [cart.spec.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/e2e/cart.spec.js)
yêu cầu đăng nhập hiện tại;  
test đang điền các trường  
tên/email của luồng cũ.

30 Thêm test tích hợp cho retry BE: [checkout.concurrent.test.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/tests/integration/checkout.concurrent.test.ts),
khi mất phản hồi, hai [outbox-relay.test.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/tests/unit/core/outbox/outbox-relay.test.ts)
checkout đồng thời, đổi giá  
trong lúc checkout,  
projection phát lại, Redis  
lỗi và worker chết giữa xử  
lý.

31 Cho CI chạy một hành trình BE: [ci.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/ci.yml); FE:
frontend--backend thực trên [test.yml](https://github.com/Thang4869/TriAD-12/blob/main/.github/workflows/test.yml)
môi trường test, thay vì chỉ
chạy hai bộ test độc lập.

32 Chạy thử chính image BE: [Dockerfile](https://github.com/Thang4869/TriAD-Backend/blob/main/Dockerfile),
production sau build: [ci.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/ci.yml)
migration, khởi động,  
`/health/ready`, checkout và
shutdown. CI hiện build  
image nhưng chưa chứng minh  
image chạy được với cấu hình
production.

33 Thử phục hồi từ backup, BE: [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md)
replay outbox và rebuild  
projection; ghi thời gian  
khôi phục và kết quả vào  
runbook.

34 Cập nhật README bằng sơ đồ BE: [README.md](https://github.com/Thang4869/TriAD-Backend/blob/main/README.md),
đúng với luồng đang chạy, [ARCHITECTURE.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/ARCHITECTURE.md)
giới hạn thanh toán hiện  
tại, cách chạy đầy đủ FE+BE  
và bằng chứng test/deploy.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Tiến độ cập nhật 01/10/2026

- **P0 đã CLOSED chắc chắn:** #1, #2, #3, #4, #5, #6, #7, #8, #9, #10,
  #11, #35 và #41.
- **P0 #12:** 🟡 **IMPLEMENTATION COMPLETE / PRODUCTION VERIFICATION PENDING** --- code, regression tests và quality gates đã hoàn tất; còn chờ kiểm chứng trên đúng hai domain Vercel + Render sau khi deploy.
- **P0 đã làm một phần, chưa được phép CLOSED:** #36.
- **P0 còn TODO:** #37, #38, #39 và #40.
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

1.  Implementation của **#12** đã hoàn tất; production verification giữ lại cho giai đoạn deploy Vercel + Render. **#35 đã CLOSED**; tiếp tục P0 theo thứ tự: **hoàn tất #36 → #37 → #38 → #39 → #40**.
2.  Sau khi toàn bộ P0 có bằng chứng kiểm thử, chuyển sang các mục P1
    theo mức độ phụ thuộc, ưu tiên #14 và #42--#55 cùng các mục liên
    quan.
3.  Thực hiện P2 và các diễn tập runtime/E2E để chứng minh hành vi
    production, recovery và CI.
4.  Đánh giá lại OOP, Clean Code, Tech Lead và production readiness dựa
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
`main` commit `bc23f66`. Những việc trùng với mục 1--34 được giữ ở vị
trí cũ, không tạo mục trùng. Các mục chưa kiểm thử runtime được diễn đạt
là **kiểm chứng**.

### P0 bổ sung --- Lỗi ảnh hưởng giao dịch hoặc truy cập

---

\# Việc cần làm File Trạng thái

---

35 Dịch `P2034`/serialization BE: [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts), ✅ CLOSED ---
conflict từ Prisma thành [prisma-checkout.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/infrastructure/repositories/prisma-checkout.repository.ts), adapter dịch
lỗi retry được **trong [prisma-error-classifier.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/database/prisma-error-classifier.ts) `P2034` thành
adapter trước khi thoát `ConflictError`;
khỏi `CheckoutService`**. `CheckoutService`
Retry dùng exponential backoff + jitter;
contention test chạy transaction
`Serializable` thật trên PostgreSQL và
xác minh conflict được dịch thành lỗi
retryable.

36 Bắt lỗi Redis trong BE: [idempotency.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/idempotency.middleware.ts), 🟡 PARTIAL ---
middleware async của [src/config/index.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/config/index.ts) TTL/recovery đã
Express 4 và chuyển qua làm; cần xác
`next(error)`; dùng TTL minh Express
ngắn cho `IN_PROGRESS` và error
cơ chế khôi phục khi propagation
process chết. Hiện state  
này cùng TTL mặc định 24  
giờ với kết quả đã hoàn  
thành.

37 Đổi cách thu hồi refresh BE: [token.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/services/token.service.ts), ⬜ TODO
token sang thao tác có [prisma-auth.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/infrastructure/repositories/prisma-auth.repository.ts)  
điều kiện  
(`revokedAt IS NULL`) và  
kiểm tra số bản ghi cập  
nhật, rồi bảo đảm cấp  
token mới theo quy tắc  
atomic. Hai lần refresh  
đồng thời không được cùng  
thành công.

38 Hạn chế truy cập BE: [app.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/app.ts), ⬜ TODO
`/metrics` ở production và [metrics.routes.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/metrics/metrics.routes.ts)  
quyết định có mở  
`/api/docs` công khai  
không; cả hai route hiện  
được mount trực tiếp mà  
không có middleware xác  
thực trên route.

39 Xác thực nội dung ảnh bằng BE: [upload.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/upload.middleware.ts), ⬜ TODO
cách đọc/giải mã file, [app.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/app.ts)  
ngoài `mimetype` do client  
khai báo; rà soát static  
route `/uploads` nếu chỉ  
dùng Cloudinary.

40 Giảm giới hạn JSON toàn BE: [app.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/app.ts) ⬜ TODO
cục `10mb` và chỉ tăng ở  
endpoint có nhu cầu thực;  
đo ảnh hưởng với giới hạn  
của proxy và rate limiter.

41 Sửa đầy đủ snapshot BE: [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts), ✅ CLOSED
projection: ngoài [order-events.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/events/order-events.ts)  
`paymentStatus`, code còn  
đặt `tax = 0`,  
`shippingFee = 0`,  
`subtotal = total`,  
`placedAt = new Date()`.  
Bổ sung dữ liệu event cần  
thiết hoặc đọc snapshot từ  
đơn gốc; dùng thời điểm  
event và backfill dữ liệu  
sai hiện có.
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

### P1 bổ sung --- Outbox, domain và kiến trúc

---

\# Việc cần làm File

---

42 Kiểm chứng thứ tự sự kiện của BE: [prisma-outbox-relay.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-outbox-relay.store.ts),
cùng aggregate khi nhiều relay [projection-handler.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-handler.ts)
claim song song; nếu người đọc  
phụ thuộc thứ tự, thêm quy tắc  
claim theo aggregate hoặc  
version.

43 Kiểm chứng batch 50 event xử lý BE: [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts),
tuần tự có thể vượt lease 60 [prisma-outbox-relay.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-outbox-relay.store.ts)
giây; nếu có, gia hạn  
lease/heartbeat hoặc claim theo  
batch nhỏ. Đo bằng handler chậm  
và hai relay.

44 Đo lag từ event chưa publish cũ BE: [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts),
nhất và theo dõi dead-letter [metrics.registry.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/metrics/metrics.registry.ts)
riêng. Hiện gauge trả về 0 khi  
batch claim rỗng, kể cả lúc  
event đang chờ retry/backoff.

45 Đưa lỗi handler vào callback BE: [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts),
`withRetry` hoặc bỏ retry ngay [event-bus.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/event-bus/event-bus.ts)
tại chỗ và dựa vào outbox retry.
Hiện `eventBus.publish()` trả  
`{success:false}` nên  
`withRetry()` không retry trường
hợp handler trả thất bại; lỗi  
chỉ được ném sau khi callback  
kết thúc.

46 Có đường vận hành để replay BE: [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts),
dead-letter và dọn event đã [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md),
publish sau thời gian lưu giữ; [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma)
xác nhận index claim và cơ chế  
chống side effect lặp.

47 Định phiên bản và kiểm tra BE: [outbox-relay.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/outbox-relay.ts),
payload outbox trước khi [domain-event.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/events/domain-event.ts)
dispatch; hiện  
`deserializeDomainEvent()` ép  
`unknown` thành `DomainEvent` và
chỉ kiểm tra là object.

48 Cập nhật trạng thái đơn qua hành BE: [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts),
vi aggregate hoặc quy tắc domain [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)
thống nhất, lưu cùng version và  
outbox. `OrdersService` hiện  
kiểm tra bằng  
`Order.canTransition()` rồi ghi  
status trực tiếp, nên có nguy cơ
tranh chấp giữa hai request.

49 Tách version dùng để kiểm soát BE: [aggregate-root.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/aggregate-root.ts),
đồng thời khỏi bộ đếm event: [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)
`AggregateRoot.raise()` hiện tự  
tăng version mỗi khi tạo sự  
kiện. Nếu version này đi xuống  
DB, phải định nghĩa rõ lúc  
hydrate và lúc update.

50 Quy định đường đi hợp lệ tới BE: [order-status.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order-status.ts),
`REFUNDED` và trạng thái thanh [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)
toán sau refund, hoặc loại  
status này nếu không dùng. Hiện  
bảng transition không có cạnh đi
vào `REFUNDED`.

51 Giữ invariant của `OrderItem` BE: [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts)
khi thêm lại cùng sản phẩm: hiện
`addItem()` cộng số lượng nhưng  
âm thầm thay giá của toàn bộ  
dòng bằng `unitPrice` mới.

52 Kiểm tra việc cùng phát BE: [order.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/domain/order.entity.ts),
`OrderStatusChangedEvent` và [order-events.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/domain/events/order-events.ts)
`OrderCancelledEvent` khi hủy  
đơn; xác định rõ mỗi handler  
nghe event nào để tránh thực  
hiện hai lần một tác dụng.

53 Thêm kiểm tra ranh giới phụ BE: [ci.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/ci.yml),
thuộc trong CI, tập trung vào [container.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts)
module domain/application không  
import adapter hạ tầng; sửa từng
vi phạm thực tế, tránh tạo  
interface cho mọi class chỉ để  
tăng điểm OOP.

54 Rà soát `src/core/unit-of-work/` BE: [README.md](https://github.com/Thang4869/TriAD-Backend/blob/main/README.md),
rỗng và claim Unit of Work trong [checkout-transaction.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/application/ports/checkout-transaction.ts)
README: triển khai transaction  
boundary qua port rõ ràng nếu  
thực sự cần, hoặc mô tả thẳng  
transaction Prisma hiện dùng.

55 Đưa hai kiểu lỗi BE: [errors.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/utils/errors.ts),
domain/application và HTTP về [error-handler.middleware.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/middlewares/error-handler.middleware.ts)
một quy tắc ánh xạ dễ kiểm  
chứng. Hiện service còn import  
`BadRequestError` trong khi  
`AppError` thuộc middleware.
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

### P2 bổ sung --- Môi trường chạy, test và tài liệu

---

\# Việc cần làm File

---

56 Bổ sung test tích hợp thật cho BE:
outbox nhiều relay, idempotency [tests/integration/checkout.concurrent.test.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/tests/integration/checkout.concurrent.test.ts),
với Redis và race refresh token; [quality-gates.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/.github/workflows/quality-gates.yml)
test unit/mock không chứng minh  
được hành vi khi crash hoặc tranh  
chấp.

57 Sửa dev Compose đang mount BE: [docker-compose.yml](https://github.com/Thang4869/TriAD-Backend/blob/main/docker-compose.yml),
`./nodemon.json` không có trong [package.json](https://github.com/Thang4869/TriAD-Backend/blob/main/package.json)
repo; kiểm tra lại lệnh dev và  
biến `QUEUE_REDIS_URL` có được đọc
hay không.

58 Xem xét tách worker BullMQ và BE: [server.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/server.ts),
relay khỏi tiến trình HTTP khi cần [bull.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/queue/bull.ts)
scale độc lập; hiện `server.ts`  
khởi động cả ba. Trước khi tách,  
đo tải và quyết định topology.

59 Đồng bộ README với code: sửa BE: [README.md](https://github.com/Thang4869/TriAD-Backend/blob/main/README.md),
`/api-docs` thành `/api/docs`, [ARCHITECTURE.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/ARCHITECTURE.md)
claim CQRS/Unit of Work/Strategy  
và các ADR trùng số; giữ phần ghi  
rõ Saga chưa ở production, bỏ mô  
tả "Internal / Private" nếu repo  
vẫn public.

60 Dọn thông báo lỗi trỏ tới BE: [persist-domain-events.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/persist-domain-events.ts),
`prisma/schema.additions.prisma` [package.json](https://github.com/Thang4869/TriAD-Backend/blob/main/package.json)
không tồn tại; xem lại dependency  
`@prisma/adapter-pg` 7.x đang nằm  
cạnh `prisma`/`@prisma/client` 5.x
và chỉ giữ package thực dùng.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

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
