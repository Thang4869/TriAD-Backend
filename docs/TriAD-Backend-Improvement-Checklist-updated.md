# TriAD Backend — Improvement Roadmap

> Đánh giá lần đầu 28/09/2026; cập nhật tiến độ 01/10/2026 sau khi tiếp
> tục refactor, chạy unit/integration tests và đối chiếu với
> `TriAD-Backend-audit-checklist.md`. Điểm hiện tại: **\~7/10**. Mục
> tiêu: **9--10/10** sau khi hoàn thành danh sách này.

## Quy ước trạng thái

| Ký hiệu | Trạng thái                                                                 |
| ------- | -------------------------------------------------------------------------- |
| ✅      | **CLOSED** — đã có code + test/evidence cần thiết                          |
| 🟡      | **PARTIAL / PENDING** — còn phần việc hoặc runtime/deployment verification |
| ⬜      | **TODO** — chưa triển khai / chưa xác minh                                 |

## Executive status — 01/10/2026

### ✅ Đã xác nhận hoàn thành

- **B4 --- CLOSED.** `/metrics` và `/api/docs` không còn được mount ở production; integration test xác nhận production trả 404.
- **B5 --- CLOSED.** Global JSON/urlencoded limit đã giảm `10mb` → `100kb`; payload quá lớn được map thành HTTP 413. Unit test, typecheck và lint PASS.
- **B8 --- CLOSED.** Content validation bằng `sharp.metadata()` đã hoàn tất; static `/uploads` và `uploads/tmp` legacy đã được loại bỏ sau khi xác nhận frontend không còn consumer. Unit test, typecheck và lint PASS.
- **B1 --- CLOSED.** Refresh-token rotation đã atomic: conditional revoke theo `revokedAt IS NULL`, revoke token cũ + tạo token mới cùng Prisma transaction, concurrent refresh race chỉ một request thành công, rollback giữ token cũ active nếu create token mới lỗi và refresh JWT mới có `jti` để bảo đảm uniqueness trong cùng một giây.
- **A3 --- CLOSED.** `PrismaCheckoutRepository.runInTransaction()` dịch Prisma `P2034` thành `ConflictError` ngay tại adapter; `CheckoutService` retry bằng exponential backoff + jitter. Có unit test retry/jitter, adapter test `P2034` → `ConflictError` và integration test contention thật trên PostgreSQL `Serializable`.
- **A6 --- CLOSED.** `IN_PROGRESS` dùng TTL tối đa 60 giây; Redis failures trước response được chuyển qua `next(error)`; lỗi `setex()`/`del()` sau response được log để quan sát. Regression tests, typecheck và lint PASS.
- **A4 --- CLOSED.** `orderNumber` không còn dựa vào `Date.now()`.
  Checkout dùng `OrderNumberGenerator` với implementation
  `CryptoOrderNumberGenerator`; có unit test kiểm tra format/VO và tạo
  1.000 giá trị không trùng.
- **A5 --- CLOSED.** Giá authoritative được đọc/chốt trong checkout
  transaction từ dữ liệu sản phẩm đã lock; không còn dùng giá stale từ
  cart đọc trước transaction để tạo order.
- **A7 --- CLOSED.** Idempotency có DB recovery: repository có
  `findOrderByIdempotencyKey`, unique scope
  `(userId, idempotencyKey)`, xử lý race/P2002 và trả lại order đã tồn
  tại thay vì tạo order thứ hai.
- **C2 --- CLOSED cho lỗi snapshot chính.** `OrderPlacedEvent` mang
  snapshot đầy đủ; projection dùng `paymentStatus`, `subtotal`, `tax`,
  `shippingFee`, `placedAt` từ event. Có utility/script rebuild
  projection và test.
- **Price-change portion của A1/E1 --- CLOSED.**
  `AdminProductService.update()` không còn publish
  `ProductPriceChanged` trực tiếp trước khi lưu. Service gọi atomic
  repository path; Prisma cập nhật product và ghi outbox trong cùng
  transaction. Integration test chứng minh cả commit và rollback khi
  outbox persistence thất bại.
- Checkout production hiện chỉ expose **COD**; CARD/BANKING chưa có
  adapter thanh toán thật nên không còn được trình bày như phương thức
  đã hỗ trợ.
- Frontend checkout đã đồng bộ validator/controller và retry cùng một
  logical checkout attempt giữ nguyên idempotency key.
- **A1/A2 --- CLOSED.** `OrdersService.updateOrderStatus` đã dùng
  conditional update theo `version`, tăng version khi cập nhật và ghi
  `OrderStatusChanged` vào outbox trong cùng Prisma transaction. Stale
  request bị conflict; lỗi ghi outbox rollback cả status/version.
  Unit/integration tests, typecheck và lint PASS.

### 🟡 Còn mở / cần tiếp tục

- **P0 #12 --- IMPLEMENTATION COMPLETE / PRODUCTION VERIFICATION PENDING.**
  Cross-origin CSRF flow không còn phụ thuộc frontend đọc cookie API bằng
  `document.cookie`; backend trả/khôi phục token qua response và
  authenticated `GET /auth/csrf`. CORS allowlist + credentials đã có và
  `COOKIE_DOMAIN` đã vào validated config. FE/BE tests và quality gates PASS;
  còn chờ Vercel + Render deployment verification.

**Bước tiếp theo:** #36 → #40 đều CLOSED. P0 #12 giữ pending production verification. Chuyển sang **C1 / audit #14** để chốt hướng CQRS/projection trước các P1 phụ thuộc.

## Phạm vi và giới hạn của đánh giá

- Đã đối chiếu repository hiện tại và hai bản export người dùng cung cấp:
  Backend `main` ở `f5a181e`, Frontend `main` ở `84431df`.
- Bản export backend hiện tại bao gồm `src/`, `tests/`, `docs/`,
  `prisma/schema.prisma`, migrations, Dockerfile, compose, Vitest configs
  và các file vận hành chính; bản export frontend cũng đã được rà theo các
  luồng auth/checkout và tham chiếu asset.
- Evidence chạy test/typecheck/lint được lấy từ các lần thực thi người dùng
  xác nhận trong phiên làm việc; riêng #40 hiện có trong working tree/export
  local nhưng chưa đồng bộ lên GitHub `main` tại thời điểm rà soát.

## Phát hiện quan trọng nhất

Không có đoạn code nào ngoài `PrismaProjectionStore` đọc các bảng
projection. Trong `container.ts`, `CatalogService`, `OrdersService` và
`DashboardService` đều nối với repository Prisma thường (`OrdersService`
chỉ nhận 2 tham số nên `readPort` mặc định là `repository`). Vì vậy phần
đọc của CQRS hiện là code chết: relay ghi projection nhưng không ai đọc,
dù ADR-003 viết "Query adapters read those tables".

## Điểm theo từng mảng (hiện tại)

| Mảng                             | Điểm |
| -------------------------------- | ---: |
| Kiến trúc / DDD                  |    7 |
| OOP / Clean Code                 |    7 |
| Độ tin cậy (outbox, concurrency) |  6.5 |
| Testing                          |    8 |
| Bảo mật                          |    7 |
| Tài liệu                         |    6 |

## README mâu thuẫn với code

| README nói                                   | Thực tế trong code / docs                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| “Production factories wire both Sagas”       | `OPERATIONS.md` và `ARCHITECTURE.md` cho thấy production path chưa nối Saga      |
| “Unit of Work pattern”                       | `core/unit-of-work` rỗng                                                         |
| “Strategy pattern cho Payment”               | Chưa thấy implementation tương ứng trong code                                    |
| “Mapper Entity ↔ Persistence ↔ DTO”          | Chủ yếu thấy ở auth/products; nhiều repository khác còn trả Prisma model/ép kiểu |
| “Domain events publish qua Outbox”           | Hiện không phải mọi domain event đều đi qua outbox                               |
| “Query adapters read those tables” (ADR-003) | Chưa có projection read adapter được nối vào composition root                    |
| Swagger ở `/api-docs`                        | Code dùng `/api/docs`                                                            |
| “Internal / Private”                         | Repository public và chưa có LICENSE                                             |

## P0 — Correctness & security blockers

### Outbox và luồng nghiệp vụ

- [x] **A1. [CLOSED]** Các luồng P0 đã xử lý gồm
      `ProductPriceChanged` và `OrderStatusChanged`: thay đổi dữ liệu và
      ghi outbox nằm trong cùng transaction. Order-status có conditional
      update theo `version`; stale request conflict và lỗi outbox rollback
      status/version.
- [x] **A2. [CLOSED]** `OrdersService.updateOrderStatus` áp dụng
      domain transition, conditional/optimistic update theo `version` và
      ghi order-status event vào outbox trong cùng transaction. Đã có
      unit/integration evidence cho stale-version conflict và rollback khi
      outbox persistence thất bại.
- [x] **A3. [CLOSED]** Checkout dùng transaction `Serializable`.
      `PrismaCheckoutRepository.runInTransaction()` dịch Prisma `P2034`
      thành `ConflictError` ngay tại adapter để `CheckoutService`
      `executeWithRetry()` bắt được. Retry dùng exponential backoff +
      jitter. Có unit test cho retry/jitter, adapter test cho
      `P2034` → `ConflictError` và contention integration test thật trên
      PostgreSQL `Serializable`.
- [x] **A4. [CLOSED]** Order number đã chuyển khỏi `Date.now()` sang
      injected `OrderNumberGenerator` với `CryptoOrderNumberGenerator`; có
      regression/unit test kiểm tra format và uniqueness.
- [x] **A5. [CLOSED]** Checkout dùng giá authoritative từ sản phẩm
      được lock/đọc trong transaction để tạo order; không còn chốt giá từ
      cart snapshot đọc trước transaction.
- [x] **A6. [CLOSED]** Idempotency Redis đã được harden:
  - `IN_PROGRESS` dùng TTL tối đa 60 giây và tự recovery khi process chết.
  - Redis failures trước response được bắt và chuyển qua `next(error)`.
  - Lỗi `setex()` / `del()` sau response được log thay vì bị nuốt im lặng.
  - Regression tests, typecheck và lint PASS.
- [x] **A7. [CLOSED]** DB là lớp bảo vệ cuối cho idempotency: có
      lookup theo idempotency key, unique scope
      `(userId, idempotencyKey)`, xử lý race/unique conflict và recovery
      trả order cũ thay vì tạo order thứ hai.
- [ ] **A8.** Đọc-sau-ghi: nếu đọc order qua projection thì sau
      checkout có thể 404 tới \~2 giây. Trả order trực tiếp từ luồng ghi,
      hoặc đọc từ bảng ghi.

### Auth và bảo mật

- [x] **B1. [CLOSED]** Refresh-token rotation đã atomic:
      conditional revoke theo `revokedAt IS NULL`; revoke token cũ và tạo
      token mới nằm trong cùng Prisma transaction. Concurrent refresh cùng
      token chỉ một request thành công; rollback giữ token cũ active nếu tạo
      token mới lỗi. Refresh JWT mới có `jti` để bảo đảm uniqueness khi rotate
      trong cùng một giây. Unit/integration tests, typecheck và lint PASS.
- [ ] **B2.** Blacklist đang dùng cả chuỗi JWT làm key Redis. Băm
      SHA-256 và dùng `jti`. `blacklistAccessToken` đang nuốt lỗi: cần log
      và quy định fail-open hay fail-closed khi Redis chết.
- [ ] **B3.** JWT thiếu `iss`, `aud`, `jti`, `typ`
      (access/refresh/preauth). Thêm và kiểm tra khi verify.
- [x] **B4. [CLOSED]** `/metrics` và `/api/docs` chỉ mount ngoài production; production trả `404`, integration test PASS.
      `!config.isProduction`; production trả `404`. Có integration test
      cho cả hai route và GitHub đã có commit `cc8eb56`.
- [x] **B5. [CLOSED]** Global JSON/urlencoded limit đã giảm xuống `100kb`; payload quá lớn trả HTTP `413`; unit test, typecheck và lint PASS.
      xuống `100kb`; upload ảnh dùng Multer nên giữ giới hạn riêng `5MB`.
      Error handler map `entity.too.large` thành HTTP `413 Request payload
too large`; unit test, typecheck và lint PASS.
- [ ] **B6. [PARTIAL]** Cross-origin delivery/recovery của CSRF token đã
      được sửa: frontend không còn đọc API-domain cookie bằng `document.cookie`;
      backend trả token sau auth và có authenticated `GET /auth/csrf` để phục
      hồi sau reload/OAuth redirect. `COOKIE_DOMAIN` đã được đưa vào validated
      config schema. Phần còn lại: double-submit token vẫn là token ngẫu nhiên
      chưa ràng buộc phiên; cần HMAC/session-bound trước khi CLOSED. Production
      verification trên Vercel + Render cũng còn pending.
- [ ] **B7.** Rate limit:
  - `skip: req.path === "/health"` là dead config vì limiter gắn ở
    `/api`.
  - Quyết định `passOnStoreError` khi Redis lỗi.
  - Thêm khoá theo tài khoản, không chỉ `ip+email`.
  - Thêm limiter cho verify-email và resend.
- [x] **B8. [CLOSED]** Upload dùng `sharp.metadata()` để xác thực nội dung thực; `/uploads` và `uploads/tmp` legacy đã được loại bỏ; unit test, typecheck và lint PASS.
      và chỉ chấp nhận `jpeg/png/webp`; fake content/unsupported format bị
      reject. Static `/uploads` và `uploads/tmp` legacy đã được loại bỏ sau
      khi xác nhận frontend không còn consumer và image storage dùng
      Cloudinary. Unit tests, typecheck và lint PASS.
- [ ] **B9.** Fallback secret cho môi trường test đang nằm trong
      `src/config/index.ts` (production code). Chuyển sang
      `tests/setup.ts`.
- [ ] **B10.** Chạy `npm audit`, nâng `multer 1.x` lên bản đã vá _(cần
      kiểm tra advisory hiện hành)_.

## P1 — Architecture alignment

### CQRS và outbox

- [ ] **C1.** Quyết định một trong hai hướng cho projection. **Giữ:**
      nối `CatalogReadPort`, `OrderHistoryReadPort`, `DashboardReadPort`
      vào adapter đọc bảng projection ở composition root. **Bỏ:** xoá
      projection và `refreshDashboard` (hiện chạy 6 query cho mỗi event mà
      không ai đọc).
- [x] **C2. [CLOSED]** ~~Nếu giữ, sửa dữ liệu projection~~ --- **Đã
      xong và đã có rebuild verification.** `paymentStatus`, `subtotal`,
      `tax`, `shippingFee`, `placedAt` giờ lấy thật từ `OrderPlacedEvent`
      (được `Order.place()` tính đúng từ aggregate), không còn gán cứng.
      Có sẵn `rebuildOrderHistoryProjection`
      (`src/core/outbox/rebuild-order-history-projection.ts` +
      `scripts/rebuild-order-history-projection.ts`) đọc lại từ bảng
      `order` gốc để backfill dữ liệu cũ đã sai, có test riêng. Còn thiếu:
  - Script chưa được khai báo thành lệnh `npm run` trong
    `package.json`.
  - `OPERATIONS.md` chưa có hướng dẫn cụ thể khi nào/cách nào chạy
    lệnh backfill này.
  - `sourceVersion` để xử lý event sai thứ tự vẫn chưa có cho
    `orderHistoryProjection` (chỉ `productCatalogProjection` có
    `sourceVersion`); `updateOrderStatus` vẫn dùng `updateMany` im
    lặng khi không tìm thấy row.
  - Dashboard (`refreshDashboard`) vẫn tính lại toàn bộ từ đầu mỗi
    lần, chưa theo delta --- xem thêm L1 ở P8 về định nghĩa doanh
    thu sai trong chính hàm này.
- [ ] **C3.** Outbox đảm bảo thứ tự theo aggregate (không claim event
      nếu còn event cũ chưa publish của cùng aggregate). Với nhiều relay
      instance, thứ tự hiện không được bảo đảm.
- [ ] **C4.** `outboxLagSeconds` đang tính trên row vừa claim, nên khi
      mọi event đang backoff nó hiện 0. Đổi thành `now - min(occurredAt)`
      của các event chưa publish (truy vấn riêng), thêm gauge cho số
      dead-letter.
- [ ] **C5.** Lease 60 giây cho batch 50 row xử lý tuần tự có thể hết
      hạn giữa chừng. Đặt lease theo từng row, hoặc heartbeat, hoặc giảm
      batch.
- [ ] **C6.** Có công cụ replay dead-letter (CLI hoặc endpoint admin),
      job dọn row đã publish, và index phù hợp cho truy vấn claim _(cần
      kiểm tra schema)_.
- [ ] **C7.** `withRetry` bọc `eventBus.publish` không có tác dụng vì
      `publish` không throw mà trả `result`. Bỏ hoặc sửa. Handler có
      side-effect (email) phải idempotent bằng
      `jobId = eventId + handler`.
- [ ] **C8.** Validate payload khi deserialize event bằng zod thay vì
      ép kiểu, và thêm `schemaVersion` cho event.

### Ranh giới và DI

- [ ] **D1.** Kiểm tra ranh giới bằng `dependency-cruiser` hoặc
      `eslint-plugin-boundaries`, chạy trong CI. Quy tắc: domain không
      import infra; application không import `prisma`/`metrics`/`tracing`;
      module chỉ import nhau qua public API.
- [ ] **D2.** Application layer đang import trực tiếp
      `metrics.registry` và `tracing`. Tạo `MetricsPort` và `TracerPort`
      rồi inject.
- [ ] **D3.** Repository đang dùng Prisma singleton toàn cục. Inject
      `PrismaClient` qua constructor.
- [ ] **D4.** Implement Unit of Work thật (`uow.run(ctx => ...)`), bỏ
      `CheckoutTransaction` mờ và các cast `as unknown as`. Nếu không làm,
      xoá thư mục `core/unit-of-work` và bỏ Unit of Work khỏi README.
- [ ] **D5.** Controller và service nên phụ thuộc interface
      (`IAuthService`...) thay vì class cụ thể, và `TOKENS` nên gắn với
      interface.
- [ ] **D6.** Composition root:
  - Không xoá một `container.ts` chỉ vì trùng tên:
    `src/core/di/container.ts` là DI container implementation, còn
    `src/container.ts` là composition root/registration. Nếu
    composition root tiếp tục lớn, tách registration theo module.
  - Tách theo module (`registerAuthModule(container)`).
  - Không chạy side effect lúc import; export `buildApp(container)`.
  - Route file không import từ `@/container`; dùng factory
    `createAuthRoutes(controller)`.
  - `health.routes.ts` đang tự `new` service, đưa vào DI.
- [ ] **D7.** `AuthRepository` và `AuthSessionUser` đăng ký hai
      instance riêng của cùng một class. Dùng chung một instance.
- [ ] **D8.** `Lifetime.Scoped` và `request.scope.middleware` có vẻ
      chưa thực sự được dùng _(cần kiểm tra)_. Nếu vậy, dùng hoặc bỏ.

### Lỗi và ranh giới lớp

- [ ] **E1.** Hai hệ thống lỗi song song. `AppError` (mang HTTP
      status) đang nằm trong file middleware và bị service import
      (`BadRequestError`), nên application layer biết mã HTTP. Chuyển sang
      lỗi ứng dụng có `code`, ánh xạ sang HTTP chỉ ở tầng presentation.
- [ ] **E2.** `StockReservationService` ném `BadRequestError` dù
      domain đã có `InsufficientStockError`. Dùng lỗi domain.

### Saga

- [ ] **F1.** Hoặc nối `CheckoutSaga` và `CancellationRefundSaga` vào
      luồng thật (kèm payment port có adapter giả để demo, có flag), hoặc
      gỡ Saga khỏi README và ADR. Hiện README nói "Production factories
      wire both Sagas" còn `OPERATIONS.md` nói ngược lại.

## P2 — Domain model & OOP maturity

- [ ] **G1.** `Order.total` bóc `Money` ra số rồi tính. Dùng
      `subtotal.add(tax).add(shipping).subtract(discount)` trong `Money`.
      Bỏ `Math.max(0, …)` bằng invariant rõ ràng.
- [ ] **G2.** `Money`:
  - Thêm `equals`, `isZero`, `greaterThan`, `Money.zero()`, `sum`,
    `allocate`.
  - Ném `DomainError` thay vì `Error`.
  - Tách `Currency` thành value object và xử lý số chữ số thập phân
    theo currency (`Math.round` hiện chỉ đúng với VND).
- [ ] **G3.** `paymentMethod` và `paymentStatus` là string. Tạo
      `PaymentMethod` và `PaymentStatus` (enum kèm bảng chuyển trạng
      thái), cùng hành vi `markPaid()` và `refund()`.
- [ ] **G4.** Trạng thái `REFUNDED` không có transition nào dẫn tới.
      Bổ sung hoặc xoá.
- [ ] **G5.** Bảng transition của `Order` đang được tạo lại mỗi lần
      gọi. Đưa thành `static readonly`, hoặc dùng State pattern nếu hành
      vi mỗi trạng thái khác nhau.
- [ ] **G6.** `hydrate()` luôn đặt `_placed = true`, và `_placed`
      trùng thông tin với `status`. Suy ra từ status và bỏ cờ.
- [ ] **G7.** `addItem` khi trùng sản phẩm sẽ ghi đè `unitPrice` bằng
      giá mới một cách im lặng. Bắt buộc cùng giá hoặc ném lỗi.
- [ ] **G8.** `cancel()` raise cả `OrderStatusChangedEvent` lẫn
      `OrderCancelledEvent`. Chọn một nguồn sự thật và document lý do.
- [ ] **G9.** `AggregateRoot.version` đang tăng theo số event, không
      phải version phục vụ concurrency. Tách `version` (lưu DB, optimistic
      lock) khỏi số thứ tự event.
- [ ] **G10.** Tách `PricingService` thành chính sách domain dùng
      Strategy: `TaxPolicy`, `ShippingPolicy`, `DiscountStrategy`
      (Percentage/Fixed). Cách này cũng làm claim "Strategy pattern" trong
      README thành thật. Cân nhắc Strategy cho `PaymentMethod` nếu README
      vẫn giữ claim đó.
- [ ] **G11.** Inject `Clock` và `IdGenerator` thay cho `new Date()`
      và `crypto.randomUUID()` rải trong domain/service, để test xác định
      được.
- [ ] **G12.** Repository trả về aggregate (qua mapper Persistence ↔
      Domain ↔ DTO) thay vì model Prisma ép kiểu `as unknown as`. README
      tuyên bố có mapper, nhưng thực tế chỉ có ở auth và products.
- [ ] **G13.** `Address` là string. Cấu trúc hoá (đường, phường, quận,
      tỉnh) hoặc ghi rõ đây là quyết định đơn giản hoá.
- [ ] **G14.** Reviews, Wishlist, Notifications không có entity
      domain. Hoặc làm aggregate có invariant thật (không trùng, giới
      hạn), hoặc sửa README thành "CRUD module có chủ đích". Không phải
      mọi module đều cần DDD, nhưng tài liệu phải khớp.
- [ ] **G15.** Application services quá to (ví dụ `AuthService` nhiều
      dependency). Tách thành use case theo hành động
      (`PlaceOrderUseCase`, `RefreshSessionUseCase`) để đúng SRP.
- [ ] **G16.** Event bus: tách `IEventBus` port; định kiểu event theo
      map (không dùng chuỗi tên tự do); đăng ký handler theo module thay
      vì một khối `subscribe` dài trong `container.ts`.

## P3 — Clean code & cleanup

- [ ] **H1.** Xoá code chết:
  - `createOrder` và `createOrderItems` trong
    `PrismaCheckoutRepository`.
  - Thư mục rỗng `checkout/domain/` và `core/unit-of-work/`.
  - File lạc `tests/unit/shared/domain/event-bus/event-bus.port.ts`.
  - Flag `NewCheckoutFlow` chỉ dùng làm span attribute.
- [ ] **H2.** Trùng lặp chức năng:
      `CheckoutService.getOrders/getOrder` và
      `OrdersService.getOrders/getOrderById` (hai API
      `/api/checkout/orders` và `/api/orders`). Chọn một nguồn.
- [ ] **H3.** Sửa log message trỏ tới file không tồn tại
      (`prisma/schema.additions.prisma`).
- [ ] **H4.** Thống nhất quy ước tên interface (`IOrdersRepository` và
      `OutboxRelayStore`/`TokenStorePort` đang lẫn lộn) và tên file
      (`.port.ts` / `-models.ts`).
- [ ] **H5.** Thống nhất ngôn ngữ comment và tài liệu (hiện lẫn
      Việt/Anh). Với portfolio gửi công ty nước ngoài, dùng tiếng Anh cho
      code và README chính.
- [ ] **H6.** Đưa magic number (`POLL_INTERVAL_MS`, `BATCH_SIZE`,
      `MAX_RETRIES`, lease...) vào config có kiểu.
- [ ] **H7.** Loại 14 chỗ `as unknown as`/`any`, thay 2 `console.*`
      bằng logger.
- [ ] **H8.** Bật thêm cờ TS: `noUncheckedIndexedAccess`,
      `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`,
      `exactOptionalPropertyTypes`. Bỏ `experimentalDecorators` và
      `emitDecoratorMetadata` (không dùng decorator), bỏ config bị comment
      trong `tsconfig.json`.
- [ ] **H9.** Ba cơ chế alias (`module-alias`, `tsconfig-paths`,
      `tsc-alias`). Giữ một cách, xoá `_moduleAliases` nếu không dùng.
- [ ] **H10.** Chia nhỏ file lớn: `src/container.ts` (14KB),
      `tokens.ts` (8KB), `domain-error.ts` (6KB) theo module.
- [ ] **H11.** ESLint đang ở v8 với `@typescript-eslint` v6. Nâng cấp
      và bật `no-explicit-any`, `no-floating-promises`, `import/no-cycle`,
      `complexity`, `max-lines-per-function` _(cần kiểm tra `.eslintrc`)_.
- [ ] **H12.** Dependencies:
  - `@prisma/adapter-pg ^7` đi với `@prisma/client ^5.22` (lệch
    phiên bản).
  - `@types/*` nằm trong `dependencies` (bcrypt, cookie-parser,
    jsonwebtoken, nodemailer, speakeasy).
  - `@types/helmet`, `@types/sharp` đã deprecated; `@types/uuid` khi
    không có `uuid`.
  - `@types/node ^26` lệch với Node ≥20.
  - `body-parser` thừa với Express.
  - `dotenv` bị load hai lần.
  - `async-retry`, `opossum` và `withRetry` tự viết chồng chéo. Chọn
    một.
- [ ] **H13.** Xác nhận `passport-*` và các package khác có thực sự
      được dùng (`npm ls` / `depcheck`).

## P4 — Testing

- [ ] **T1.** Thêm test end-to-end bằng `supertest` cho luồng chính:
      register → login → cart → checkout → đổi trạng thái đơn. Hiện
      `supertest` có trong devDependencies nhưng chỉ thấy
      `app.csrf.test.ts` dùng app thật.
- [ ] **T2.** Test tích hợp còn thiếu (README nói có test Outbox nhưng
      danh sách file không có):
  - `OutboxRelay` với Postgres thật (2 instance chạy song song,
    lease hết hạn, dead-letter, thứ tự).
  - `idempotencyMiddleware` với Redis thật.
  - Orders repository.
  - Đổi giá song song với checkout.
- [ ] **T3.** Contract test OpenAPI hiện chỉ 621B, gần như tượng
      trưng. Kiểm tra response thật so với schema; cân nhắc sinh OpenAPI
      từ zod (`zod-to-openapi`) thay vì viết tay các file `*.swagger.ts`
      để tránh lệch. Có thể thêm Pact với frontend.
- [ ] **T4.** Mutation testing (Stryker) cho `domain/` và
      `value-objects/`, đặt ngưỡng trong CI.
- [ ] **T5.** Đặt ngưỡng coverage trong config vitest và cho CI fail
      khi tụt _(cần kiểm tra config)_.
- [ ] **T6.** Mở rộng `chaos-outbox.ts` (hiện 885B) thành kịch bản
      chạy trong CI: kill relay giữa batch, mất kết nối DB.
- [ ] **T7.** Load test bằng k6 cho checkout với sản phẩm "hot"; lưu
      kết quả vào `docs/` (rất hợp để đưa vào CV).
- [ ] **T8.** Dùng test data builder (Object Mother) và in-memory fake
      repository cho service test thay vì mock từng lời gọi.
- [ ] **T9.** Kiểm tra kiến trúc như test (`dependency-cruiser` trong
      CI, xem D1).

## P5 — Packaging, CI/CD & production operations

- [ ] **I1.** `docker-compose.prod.yml` sẽ **không khởi động được**
      nếu không sửa: `config` bắt buộc `SMTP_*` và `CLOUDINARY_*` ở
      production, còn compose không truyền các biến này (cũng thiếu
      `FRONTEND_URL`, `CORS_ORIGIN`).
- [ ] **I2.** `docker-compose.prod.yml` còn:
  - Mount `./otel-collector-config.yml` không có trong repo.
  - Port `3000` trong khi port mặc định là `5000`.
  - Volume `product-images` khai báo nhưng không dùng.
  - Thiếu healthcheck, giới hạn tài nguyên, và bước chạy
    `prisma migrate deploy`.
- [ ] **I3.** `docker-compose.yml` (dev): `version: "3.8"` đã lỗi
      thời; mount `./nodemon.json` không có trong repo (Docker sẽ tạo thư
      mục rỗng); bind cổng Postgres/Redis vào `127.0.0.1`;
      `QUEUE_REDIS_URL` được set nhưng config schema có vẻ không có _(cần
      kiểm tra)_.
- [ ] **I4.** `Dockerfile` _(cần kiểm tra vì không có trong export)_:
      multi-stage, user non-root, `npm ci --omit=dev`, `HEALTHCHECK`, ghim
      phiên bản/digest base image, `.dockerignore`.
- [ ] **I5.** Tách worker: relay và BullMQ worker đang chạy trong tiến
      trình API (`server.ts`). Thêm entrypoint `worker.ts` hoặc cờ
      `RUN_RELAY` / `RUN_WORKERS` để scale riêng.
- [ ] **I6.** Graceful shutdown: đảm bảo readiness trả 503 trước khi
      đóng, và đóng đủ queue, Redis, Prisma _(cần đọc hết `server.ts`)_.
- [ ] **I7.** CI (có `quality-gates.yml`, chưa đọc được): chạy cả
      integration test (Testcontainers cần Docker), `npm audit`, CodeQL,
      Dependabot hoặc Renovate, build Docker image, kiểm tra schema drift
      (`prisma migrate diff`), commitlint, upload coverage.
- [ ] **I8.** Quản lý phát hành: tag `v1.0.0`, `CHANGELOG.md`, semver,
      branch protection. Repo có 480 commit nhưng chưa có release nào.
- [ ] **I9.** Cấu hình hạ tầng dữ liệu: `connection_limit` của Prisma,
      `statement_timeout`, `idle_in_transaction_session_timeout`, chính
      sách backup, `maxmemory-policy noeviction` cho Redis dùng với BullMQ
      (tách Redis cache/rate-limit khỏi queue).
- [ ] **I10.** Bí mật: dùng Docker/Kubernetes secrets thay vì biến môi
      trường thuần; xác nhận `.env.example` đầy đủ và không chứa giá trị
      thật _(cần kiểm tra)_.

## P6 — Observability & API

- [ ] **J1.** Log có `trace_id` liên kết với OpenTelemetry; metric
      HTTP dùng route pattern (không dùng URL thô để tránh cardinality
      cao).
- [ ] **J2.** Thêm dashboard Grafana (JSON commit trong repo), cảnh
      báo dựa trên SLO (burn-rate), và link runbook trong `alerts.yml`.
- [ ] **J3.** Audit log cho hành động admin (đổi trạng thái đơn, xoá
      sản phẩm).
- [ ] **J4.** Versioning API (`/api/v1`), cursor pagination cho danh
      sách lớn, mã lỗi được liệt kê trong tài liệu.

## P7 — Documentation & CV presentation

- [ ] **K1.** Viết lại README cho khớp code:
  - Một hệ đánh số duy nhất (hiện có ba mục "10").
  - ADR-003 xuất hiện hai lần với nội dung khác nhau.
  - Sửa `/api-docs` thành `/api/docs`.
  - Sửa "Internal / Private" (repo đang public) và thêm `LICENSE`.
  - Thêm mục **Known limitations**. Phần Trade-offs trong
    `ARCHITECTURE.md` đã tốt, hãy dùng cùng tinh thần thành thật đó.
  - Bỏ tự nhận "Tech Lead Level" và các dấu ✅ khi chưa đủ bằng
    chứng.
- [ ] **K2.** Tách ADR thành `docs/adr/0001-….md` (Status / Context /
      Decision / Consequences), không nhân đôi giữa README và
      `ARCHITECTURE.md`.
- [ ] **K3.** Thêm mô tả repo, topics, sơ đồ kiến trúc dạng ảnh, ví dụ
      `curl`, link sang repo frontend, `SECURITY.md`, `CONTRIBUTING.md`.
- [ ] **K4.** Deploy bản demo (Render / Fly / Railway) và đưa link
      Swagger vào README. Người tuyển dụng thường chạy thử thay vì đọc
      code.
- [ ] **K5.** Ghi vào CV những số liệu đo được: kết quả k6, số test,
      coverage, mutation score. Ví dụ: "chống oversell bằng khoá dòng +
      optimistic version, kiểm chứng bằng test đồng thời".

## Tiêu chí "xong" để tự tin nói 9--10/10

- [ ] Mọi domain event cần độ bền/side effect sau commit đi qua
      outbox; có test failure/kill-process chứng minh không mất event ở
      các luồng quan trọng.
- [ ] `dependency-cruiser` đạt trong CI; không còn `any` /
      `as unknown as` ngoài một ranh giới adapter hẹp.
- [ ] Domain (Order, Product, Money) có bảng transition rõ, không còn
      primitive obsession ở tiền và thanh toán.
- [ ] Projection hoặc được đọc thật, hoặc đã bị gỡ.
- [ ] Mỗi khẳng định trong README trỏ được tới một test hoặc một file
      cụ thể.
- [ ] `docker compose -f docker-compose.prod.yml up` chạy được từ đầu,
      có demo trực tuyến.
- [ ] Có số liệu tải (k6) và mutation score cho domain.

> Lưu ý: khó chạm 10 tuyệt đối chỉ bằng code. Điểm cuối thường đến từ
> thứ không nằm trong repo: chạy trên môi trường thật với tải thật, và
> được người khác review. Làm hết danh sách này thì 9/10 là mục tiêu hợp
> lý.

## P8 — Newly verified findings

- [ ] **L1. Định nghĩa "doanh thu" sai và không nhất quán giữa hai
      nơi.** `PrismaDashboardRepository.getTotalRevenue` tính tổng `total`
      của mọi đơn có `status != CANCELLED`, không lọc theo `paymentStatus`
      --- nghĩa là đơn COD chưa thu tiền vẫn tính vào doanh thu.
      `refreshDashboard` (projection) còn tính tổng **toàn bộ đơn**, không
      lọc trạng thái nào. Hai nơi ra hai con số khác nhau, và cả hai đều
      không phản ánh tiền đã thực thu. Quyết định rõ "doanh thu" = tổng
      đơn đã `PAID`, hay tổng giá trị đơn không huỷ, rồi áp dụng thống
      nhất ở cả repository chính và projection.
- [ ] **L2. `existsAndActive` không kiểm tra `isActive`.** Trong
      `prisma-products.repository.ts`, hàm chỉ kiểm tra sản phẩm có tồn
      tại (`findUnique` rồi `!== null`), không lọc `isActive: true`. Bất
      kỳ chỗ nào dùng hàm này để xác nhận "sản phẩm đang bán" trước khi
      cho thêm vào giỏ/đặt hàng đều có thể chấp nhận sản phẩm đã bị ẩn/xoá
      mềm. Sửa thành `findUnique({ where: { id, isActive: true } })`.
- [ ] **L3. Ngưỡng miễn phí vận chuyển: xác nhận lại giữa backend và
      frontend.** Backend (`pricing.service.ts`) dùng so sánh chặt:
      `subtotal > FREE_SHIPPING_THRESHOLD` (đúng bằng ngưỡng thì **không**
      miễn phí ship). Nếu frontend hiển thị dùng `>=`, số tiền hiển thị
      lúc thanh toán sẽ khác số tiền server tính đúng tại mốc ngưỡng. Cần
      đối chiếu code frontend `CheckoutRenderer.js` để xác nhận, sau đó
      thống nhất một chiều --- tốt nhất là để server luôn là nguồn sự thật
      và frontend chỉ hiển thị lại kết quả server trả về, không tự tính
      lại (xem cả mục C-tương-đương ở phần độ tin cậy).

## Tiến độ đồng bộ với audit checklist --- 01/10/2026

- **CLOSED chắc chắn liên quan checklist này:** A1, A2, A3, A4, A5, A6, A7, C2.
- **P0 code-side:** #36, #37, #38, #39 và #40 đều CLOSED.
- **PARTIAL/PENDING:** chỉ P0 #12 còn production verification trên Vercel + Render.
- **NEXT:** C1 / audit #14 — quyết định giữ hay bỏ projection/read-model.
- **Chưa đánh dấu CLOSED nếu chưa có đủ code + regression/integration
  evidence + quality gates.**
- Mapping chính: audit #9 ↔ A1/A2; #35 ↔ A3; #7 ↔ A4; #6 ↔ A5; #36 ↔
  A6; #4 ↔ A7; #37 ↔ B1; #38 ↔ B4; #40 ↔ B5; #39 ↔ B8; #41 ↔ C2.

## Thứ tự đề xuất

1.  Commit/push nhóm thay đổi **B5/#40 + B8/#39** hiện tại.
2.  Giữ P0 #12 cho production verification trên Vercel + Render.
3.  Quyết định **C1 / audit #14** (giữ hoặc bỏ projection/read-model) trước,
    vì đây là dependency cho dashboard revenue và nhiều mục outbox/P1.
4.  Sau C1, xử lý #13 và #42--#55 theo dependency, rồi mới mở rộng abstraction.
5.  Thực hiện P4/P5 bằng integration/E2E/runtime evidence.
6.  Cuối cùng đồng bộ README, demo và số liệu CV với những gì
    code/test/deployment thực sự chứng minh.
