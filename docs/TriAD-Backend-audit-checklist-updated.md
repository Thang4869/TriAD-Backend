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

### #13 — ✅ CLOSED

**Quyết định semantics:** Dashboard hiện biểu diễn **gross order value (GMV)**, không gọi là doanh thu đã thu tiền. GMV là tổng `Order.total` của các order có `status != CANCELLED`; COD/PENDING và REFUNDED vẫn được tính theo semantics giá trị đơn, còn CANCELLED bị loại. Hệ thống hiện chỉ checkout COD/PENDING và chưa có payment settlement chuyển order sang `PAID`, nên không lọc `paymentStatus = PAID`.

**Đã hoàn tất:** `getGrossOrderValue` và `getGrossOrderValueByDay` dùng cùng điều kiện trạng thái, cùng mốc `sinceDate`, normalize aggregate rỗng về `0`; daily grouping trả `grossOrderValue`. Dashboard projection cũng lọc `CANCELLED` và lưu vào `totalGrossOrderValue`. Integration tests chứng minh COD/PENDING, REFUNDED, CANCELLED, date boundary, daily grouping và không double count.

**File liên quan:** [prisma-dashboard.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/admin/dashboard/infrastructure/repositories/prisma-dashboard.repository.ts), [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts)

### #14 — ✅ CLOSED

**Quyết định:** **GIỮ projection/read-model.** Catalog dùng `ProductCatalogReadPort`/`PrismaProductCatalogReadRepository`; Orders dùng `OrderHistoryReadPort`/`PrismaOrderHistoryReadRepository`; Dashboard dùng `DashboardReadPort`/`PrismaDashboardReadRepository` mới, được bind qua `TOKENS.DashboardRead` trong composition root. Dashboard đọc `admin_dashboard_projection` cho summary, `order_history_projection` cho GMV/status/daily/top-selling, và `product_catalog_projection` cho low-stock. `newUsers30Days` dùng query hẹp trên `users` vì chưa có user projection. Không còn fallback sang write repository.

**Evidence:** `tests/integration/projection.read-models.test.ts` chứng minh divergent write/read sources; `tests/unit/core/di/dashboard-wiring.test.ts` chứng minh DashboardService nhận adapter projection; Catalog/Orders/ProjectionHandler có regression tests tương ứng.

**File liên quan:** [container.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts), [catalog.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/services/catalog.service.ts), [prisma-product-catalog-read.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/infrastructure/repositories/prisma-product-catalog-read.repository.ts), [orders.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/orders.service.ts), [prisma-order-history-read.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/infrastructure/repositories/prisma-order-history-read.repository.ts), [dashboard.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/admin/dashboard/dashboard.service.ts)

### #15 — ✅ CLOSED

**Đã hoàn tất:** mọi product mutation ảnh hưởng catalog đều có durable outbox path. Create dùng `createWithEvents`; generic update và image metadata dùng `updateWithEvents`; price/activate/deactivate giữ atomic paths hiện có; checkout stock decrement ghi `ProductUpdatedEvent` trong cùng transaction với stock/order/cart. Không còn `AdminProductService` hoặc image worker publish product event trực tiếp qua `EventBus`.

**Evidence:** integration tests chứng minh create/update rollback, image worker failure propagation, checkout stock-event commit/rollback và product mutation convergence vào catalog projection. Shared `persistEvents` helper dùng chung cho typed events và aggregate events.

**File liên quan:** [admin-product.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/services/admin-product.service.ts), [prisma-products.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/infrastructure/repositories/prisma-products.repository.ts), [product.entity.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/domain/product.entity.ts), [projection-handler.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-handler.ts), [container.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/container.ts)

### #16 — ✅ CLOSED

**Đã hoàn tất:** `sourceVersion` monotonic CAS cho Product Catalog và Order
History; duplicate/stale/out-of-order events là no-op; status-before-placement
retryable; OrderPlaced dùng revision 0 và status events dùng committed Order
revision; unversioned order projection events bị reject không fallback timestamp.

Legacy Order History và Product Catalog rows được baseline `sourceVersion = -1`
trong migration, sau đó rebuild authoritative nâng lên `Order.version` hoặc
`Product.version`. Product rebuild dùng cùng CAS writer với live handler; rating
là derived dimension riêng, được recompute authoritative với row lock ngay cả
khi Product version không đổi.

**Evidence:** `tests/integration/projection.ordering.test.ts` chứng minh legacy
stale repair, rebuild idempotency, newer-row protection, concurrent writes và
same-version rating repair trên PostgreSQL thật. Unit tests chứng minh P2002
same-identity recovery, unrelated unique conflict rethrow, sourceVersion
persistence, relay preservation và missing/unversioned event handling.

**Quality gates:** Docker/Testcontainers, typecheck, lint, 817 unit tests, 109
integration tests, contract tests, build, Prisma validation và diff check PASS.

**File liên quan:** [projection-writer.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-writer.ts), [projection-rating.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-rating.ts), [prisma-projection.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-projection.store.ts), [rebuild-order-history-projection.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/rebuild-order-history-projection.ts), [rebuild-product-catalog-projection.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/rebuild-product-catalog-projection.ts), [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md)

### #17 — ✅ CLOSED

**Việc đã làm:** Backend dùng `CHECKOUT_PRICING.FREE_SHIPPING_THRESHOLD` với điều kiện `>=`. Frontend giữ estimate trước submit, còn success modal hiển thị `order.shippingFee` từ server nên không thể ghi đè kết quả cuối.

**File liên quan:** [pricing.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/pricing.service.ts), [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)

### #18 — ✅ CLOSED

**Việc đã làm:** Checkout response dùng `result.order` cho cả checkout mới và idempotent replay. Swagger công khai `subtotal`, `tax`, `shippingFee`, `discountAmount`, `discountCode` và `total`; frontend success modal hiển thị toàn bộ các trường từ order persisted.

**File liên quan:** [pricing.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/pricing.service.ts), [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)

### #19 — ✅ CLOSED

**Việc đã làm:** `Money` dùng VND integer-safe, từ chối giá trị không hữu hạn, âm và ngoài `Number.isSafeInteger`; `add`, `subtract` và `multiply` giữ invariant overflow/non-negative/currency. Chính sách làm tròn canonical là half-up (`Math.round`). Các cột tiền đã chuyển sang PostgreSQL `numeric(18,0)` qua migration `20261002160000_make_money_exact`; `Discount.value` dùng `numeric(18,4)` để giữ phần trăm, còn `minOrderAmount` là `numeric(18,0)`. Prisma Decimal chỉ tồn tại ở infrastructure boundary và được map thành số JSON an toàn trước domain/API/event. Dashboard aggregation giữ `numeric` trong SQL và kiểm tra safe integer ở boundary.

**File liên quan:** [money.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/shared/value-objects/money.ts), [schema.prisma](https://github.com/Thang4869/TriAD-Backend/blob/main/prisma/schema.prisma)

### #20 — ✅ CLOSED

**Việc đã làm:** `existsAndActive` chỉ trả `true` khi bản ghi có `isActive: true`; active, inactive và missing đều có test repository. `ProductImageService` tiếp tục dùng cổng này nên inactive upload bị từ chối.

**File liên quan:** [prisma-products.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/products/infrastructure/repositories/prisma-products.repository.ts)

### #21 — ✅ CLOSED

**Việc đã làm:** `lockProductsForUpdate` khóa và trả về `id`, `name`, `price`, `stock`, `version`, `isActive`. Checkout kiểm tra snapshot này cho product tồn tại, active, quantity dương nguyên và đủ stock trước khi decrement; order dùng locked price. PostgreSQL integration tests chứng minh lock fields, rollback khi event thất bại và stock contention/serializable conflict.

**File liên quan:** [stock-reservation.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/services/stock-reservation.service.ts), [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)

### #22 — ✅ CLOSED

**Việc cần làm:** Đã kiểm chứng hai yêu cầu refresh đồng thời dùng cùng token và trường hợp refresh trong cùng một giây. Atomic rotation chỉ cho một request thành công; refresh token mới có `jti` để không trùng khi phát hành trong cùng một giây.

**File liên quan:** [token.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/services/token.service.ts), [prisma-auth.repository.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/infrastructure/repositories/prisma-auth.repository.ts), `tests/integration/auth.refresh-token-race.test.ts`

### #23 — 🟡 IMPLEMENTATION COMPLETE / EXTERNAL PROVIDER SMOKE PENDING

**Đã hoàn tất cục bộ:** OAuth dùng `provider + providerSubject` làm danh tính chuẩn với unique constraint PostgreSQL; email chỉ là thuộc tính. State có 32 byte entropy, TTL 10 phút, gắn provider và consume một lần bằng Redis Lua atomic get-and-delete. Google chỉ tin email khi profile trả về `verified === true`; Facebook không tự suy diễn verified. Email provider chưa verified không được tự động link tài khoản local; user mới được tạo ở trạng thái chưa verified và dùng lại email verification hiện có. OAuth account, User, Cart và UserRegistered event được tạo atomically; duplicate callback/race được DB unique constraint xử lý.

**Còn chờ external smoke:** real Google/Facebook authorization redirect và callback, deployed callback URL, cookie và CORS behavior. Chưa có credentials/provider runtime verification trong môi trường này.

**File liên quan:** [oauth2.strategy.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/strategies/oauth2.strategy.ts), [auth.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/auth/auth.service.ts)

### #24 — ⬜ OPEN

**Việc cần làm:** Chỉ tích hợp Saga khi có adapter, thanh toán và hoàn tiền thật; lúc, đó kiểm thử khôi phục sau crash, chạy lại bước và compensation. Hiện tài liệu xác nhận Saga chưa ở request path production.

**File liên quan:** [checkout.saga.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/application/checkout.saga.ts), [cancellation-refund.saga.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/orders/application/cancellation-refund.saga.ts), [OPERATIONS.md](https://github.com/Thang4869/TriAD-Backend/blob/main/docs/OPERATIONS.md)

### #25 — ✅ CLOSED

**Đã hoàn tất:** Xoá `NewCheckoutFlow` vì audit xác nhận chỉ có một production checkout flow; không còn trace-only flag hoặc `FEATURE_NEW_CHECKOUT_FLOW`. Checkout transaction hiện tại giữ nguyên. `CheckoutSaga` vẫn chưa được nối vào request path production; bước confirmation của Saga được khai báo rõ ràng và việc rollout vẫn thuộc P1 #24.

**File liên quan:** [checkout.service.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/modules/checkout/checkout.service.ts)

### #26 — ✅ CLOSED

**Đã hoàn tất:** CheckoutRenderer dựng summary bằng DOM nodes và `textContent`; malicious product-name tests xác nhận không tạo `IMG`, `SCRIPT` hoặc event handler executable.

**File liên quan:** [CheckoutRenderer.js](https://github.com/Thang4869/TriAD-12/blob/main/src/modules/checkout/CheckoutRenderer.js)

## P2 — Quality evidence & portfolio readiness

### #27 — ✅ CLOSED

**Đã hoàn tất:** CheckoutController tests dùng CheckoutValidator thật với DOM form hiện tại, kiểm tra payload `{ paymentMethod, address, phone, notes, discountCode }`, validation lỗi và optional-field normalization.

**File liên quan:** [CheckoutController.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/unit/modules/checkout/CheckoutController.test.js), [CheckoutValidator.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/unit/modules/checkout/CheckoutValidator.test.js)

### #28 — ✅ CLOSED

**Đã hoàn tất:** Integration test dùng CartController, CartRepository, CheckoutService, CheckoutController, CheckoutValidator và CheckoutRenderer thật trên stateful fake HTTP backend; xác nhận add-cart → checkout → server order pricing/order number → cart empty, cùng failure path giữ cart.

**File liên quan:** [checkout.flow.test.js](https://github.com/Thang4869/TriAD-12/blob/main/tests/integration/checkout.flow.test.js)

### #29 — ✅ CLOSED

**Đã hoàn tất:** Playwright khởi động Vite đúng từ frontend repository trên port được cấu hình, phục vụ authoritative `public/pages/checkout-modal.html` và `public/pages/success-modal.html`. Current authenticated checkout flow passed locally with address/phone/notes/discount selectors, returned order number, server total and empty-cart assertions.

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

## Tiến độ cập nhật 01/10/2026 — đối chiếu `DNEK-output(5).md`

- Export `DNEK-output(5).md` được tạo lúc **07:17:57 (Asia/Saigon)** và gồm **339 files**; export đã chứa migration product-catalog projection, rebuild scripts, `PrismaProductCatalogReadRepository`, `PrismaOrderHistoryReadRepository` và wiring DI tương ứng. fileciteturn59file2L5-L8
- **P0 đã CLOSED chắc chắn trên code/test:** #1–#11 và #35–#41. Riêng P0 #12 vẫn pending production verification.
- **P1 #14 / C1:** ✅ **CLOSED** — Catalog, Orders và Dashboard đều đọc qua query-side ports/adapters; dashboard có divergence integration evidence và không còn legacy write-model repository/token.
- **P1 #15:** ✅ **CLOSED** — product create, generic/price update, activate/deactivate, image metadata và checkout stock mutation đều có durable event/outbox guarantee; rollback và projection convergence đã có evidence.
- **P1 #16:** ✅ **CLOSED** — legacy baseline `-1`, monotonic CAS/P2002 handling, Order/Product sourceVersion persistence, duplicate/out-of-order safety, status dependency retry, rating repair, rebuild/live protection và operations runbook đã có evidence; Docker-based integration và full quality gates PASS.
- **P1 #23:** 🟡 **IMPLEMENTATION COMPLETE / EXTERNAL PROVIDER SMOKE PENDING** — provider subject identity, state replay protection, email trust/linking policy, unit tests và PostgreSQL integration tests đã hoàn tất; còn chờ Google/Facebook runtime verification.
- **P1 #25:** ✅ **CLOSED** — dead `NewCheckoutFlow` removed; single transaction-based checkout remains and Saga production rollout stays deferred to #24.
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
3.  **P1 #14 / C1: ✅ CLOSED.** Hướng **GIỮ projection/read-model** đã được nối đầy đủ cho Catalog, Orders và Dashboard; divergence evidence đã có.
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

### #42 — ✅ CLOSED

**Việc đã làm:** Kiểm chứng bằng test PostgreSQL thật với hai store và hai relay owner khác nhau. Same-aggregate events có thể cùng in-flight và hoàn tất ngược thứ tự; đây là chính sách được chấp nhận vì order/product projections dùng CAS `sourceVersion`, equal version idempotent, stale version bị bỏ qua, còn email/notification được bảo vệ bằng handler tracker và idempotency key. Aggregate độc lập vẫn claim/process song song. Không thêm global FIFO hoặc mutex theo aggregate.

**Evidence:** `tests/integration/outbox.relay-concurrency.test.ts` PASS: same aggregate reverse completion converges to the newer projection version; different aggregates remain concurrent; no event is owned by both relays.

**File liên quan:** [prisma-outbox-relay.store.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/prisma-outbox-relay.store.ts), [projection-handler.ts](https://github.com/Thang4869/TriAD-Backend/blob/main/src/core/outbox/projection-handler.ts)

### #43 — ✅ CLOSED

**Việc đã làm:** Relay có options timing nhưng giữ mặc định production poll 2s, batch 50, max attempts 10, lease 60s. Heartbeat gia hạn toàn bộ rows còn pending trong batch; `updateClaimed` trả kết quả ownership và chỉ ghi khi owner còn giữ lease. Khi relay chết, heartbeat dừng và lease hết hạn để relay khác reclaim; stale owner không thể publish/clear/rewrite claim của relay mới.

**Evidence:** `tests/integration/outbox.relay-concurrency.test.ts` PASS với lease ngắn: handler chậm quá lease ban đầu vẫn không bị relay thứ hai lấy, abandoned lease được reclaim, stale-owner update bị từ chối. Unit tests cover defaults, heartbeat lifecycle, ownership loss and poll overlap.

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
