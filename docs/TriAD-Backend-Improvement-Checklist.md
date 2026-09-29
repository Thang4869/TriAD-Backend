# TriAD-Backend: Checklist hoàn thiện dự án

> Đánh giá lần đầu 28/09/2026, cập nhật 29/09/2026 sau khi đối chiếu với checklist của một AI khác (`TriAD-Backend-audit-checklist.md`, có xét cả frontend `TriAD-12`) và bản export code mới nhất (313 file).
> Điểm hiện tại: **~7/10**. Mục tiêu: **9–10/10** sau khi hoàn thành danh sách này.

## Cập nhật 29/09 — đối chiếu với checklist AI khác + xác minh bản sửa gần nhất

**Đã xác nhận sửa đúng:**

- `paymentStatus` khi đặt đơn giờ là `PENDING` thật (không còn hardcode `"PAID"`); projection lấy `tax`/`shippingFee`/`subtotal`/`placedAt` từ event thay vì gán cứng/`new Date()`.
- Domain có thêm value object: `OrderNumber`, `Address`, `Email`, `PhoneNumber`, và `PaymentStatus`/`PaymentMethod` dạng const object có kiểu thay vì string thô — một phần của G3/G13.
- `runInTransaction` của checkout giờ dùng `isolationLevel: Serializable` — cải thiện tốt cho A3, nhưng xem lưu ý ngay dưới.
- `PrismaErrorClassifier` đã phân loại đúng `P2034` → `TRANSACTION_CONFLICT`, nhưng **chỉ được dùng ở error-handler middleware (tầng HTTP), chưa được dùng trong `executeWithRetry` của checkout** — nghĩa là A3 vẫn chưa đóng: transaction serializable vẫn có thể fail với `P2034` mà không được retry ở đúng chỗ.

**Đã kiểm tra và xác nhận CHƯA sửa (dù có vẻ đã động vào file):**

- A2/A1 (outbox cho `OrdersService.updateOrderStatus`): vẫn dùng `Order.canTransition` tĩnh, update repo trực tiếp, publish `.catch(logger.error)` ngoài outbox.
- C1 (projection không được đọc): `OrdersService` vẫn có `readPort: OrderHistoryReadPort = repository` — mặc định đọc từ repo ghi, không phải projection.
- A4/A5 (orderNumber trùng, giá đọc ngoài transaction): `orderNumber = ORD-${Date.now()...}` và giá vẫn lấy từ `item.product.price` (đọc ở `findUserCartForCheckout`, **ngoài** transaction), trong khi `lockProductsForUpdate` trả `price` đã khoá nhưng không dùng.
- A7 (idempotent trả đơn cũ khi trùng key): `checkout()` vẫn luôn trả `idempotent: false`; không có chỗ nào bắt lỗi unique constraint trên `idempotencyKey` để trả lại đơn cũ.
- E1 (`admin-product.service.update` publish event trước khi lưu DB): vẫn giữ nguyên thứ tự sai.
- B1 (refresh token race): `revokeRefreshToken` vẫn là `update` vô điều kiện theo `id`, không phải `updateMany` có điều kiện `revokedAt: null` kèm kiểm tra `count`.

**Phát hiện mới từ checklist AI khác, đã tự xác minh đúng trong code — bổ sung vào danh sách dưới:**

- Định nghĩa "doanh thu" không nhất quán và có thể sai (xem **L1**).
- `existsAndActive` không kiểm tra `isActive` (xem **L2**).
- Ngưỡng miễn phí vận chuyển dùng `>` ở backend, cần đối chiếu với frontend dùng `>=` (xem **L3**, phần backend đã xác minh, phần frontend chưa).

**Chưa tự xác minh được** (thiếu `schema.prisma`, `Dockerfile`, `.github/workflows`, và toàn bộ code `TriAD-12` trong export hiện có): các mục liên quan unique constraint của `orderNumber`, cấu hình CI/Docker, và mọi mục phía frontend trong checklist kia (#1, #5, #12, #17 phần FE, #26–29). Về mặt logic các mục đó hợp lý, nhưng nên tự đối chiếu trực tiếp với code frontend hoặc gửi export frontend để mình kiểm tra.

## Phạm vi và giới hạn của đánh giá

- Đã đọc: README trên GitHub, toàn bộ `src/`, `tests/`, `docs/`, `prisma/migrations/`, `docker-compose*.yml`, `package.json`, `tsconfig.json`.
- **Không xem được** (export không đưa vào): `Dockerfile`, `vitest*.mts`, `.github/workflows`, `.eslintrc.cjs`, `schema.prisma`, `.env.example`. Các mục liên quan ghi _(cần kiểm tra)_.
- Chưa chạy test hay CI, chưa xem repo frontend.

## Phát hiện quan trọng nhất

Không có đoạn code nào ngoài `PrismaProjectionStore` đọc các bảng projection. Trong `container.ts`, `CatalogService`, `OrdersService` và `DashboardService` đều nối với repository Prisma thường (`OrdersService` chỉ nhận 2 tham số nên `readPort` mặc định là `repository`). Vì vậy phần đọc của CQRS hiện là code chết: relay ghi projection nhưng không ai đọc, dù ADR-003 viết "Query adapters read those tables".

## Điểm theo từng mảng (hiện tại)

| Mảng                             | Điểm |
| -------------------------------- | ---- |
| Kiến trúc / DDD                  | 7    |
| OOP / Clean Code                 | 7    |
| Độ tin cậy (outbox, concurrency) | 6.5  |
| Testing                          | 8    |
| Bảo mật                          | 7    |
| Tài liệu                         | 6    |

## README mâu thuẫn với code

| README nói                                   | Thực tế                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| "Production factories wire both Sagas"       | `OPERATIONS.md` và `ARCHITECTURE.md` nói rõ chưa nối             |
| "Unit of Work pattern"                       | Thư mục `core/unit-of-work` rỗng                                 |
| "Strategy pattern cho Payment"               | Không thấy trong code                                            |
| "Mapper Entity ↔ Persistence ↔ DTO"          | Chỉ có ở auth và products, còn lại repo trả model Prisma ép kiểu |
| "Domain events publish qua Outbox"           | Chỉ `OrderPlaced` đi qua outbox                                  |
| "Query adapters read those tables" (ADR-003) | Không có adapter đọc projection nào được nối                     |
| Swagger ở `/api-docs`                        | Code là `/api/docs`                                              |
| "Internal / Private"                         | Repo public, không có LICENSE                                    |

---

## P0. Lỗi đúng/sai và bảo mật (làm trước)

### Outbox và luồng nghiệp vụ

- [ ] **A1.** Đưa mọi event qua outbox: `OrdersService.updateOrderStatus`, `AuthService.publishEvents`, `AdminProductService.publishEvents`. Bỏ `eventBus.publish()` in-process kèm `.catch(logger.error)`. _Hoàn thành khi:_ kill process giữa lúc ghi DB và publish thì không mất event (có chaos test).
- [ ] **A2.** `OrdersService` phải dùng aggregate: `hydrate → confirm/ship/deliver/cancel → save` trong một transaction, kèm optimistic lock và outbox. Bỏ `Order.canTransition` static gọi từ service và bỏ `BadRequestError` tự chế (dùng `InvalidOrderTransitionError`).
- [ ] **A3.** Checkout chỉ retry `ConflictError`, nên `P2034` (serialization failure) không được retry. Dịch `P2034` / `40001` / deadlock `40P01` thành lỗi có thể retry ở adapter, thêm jitter cho backoff.
- [ ] **A4.** `orderNumber = ORD-${Date.now()...}` có thể trùng khi hai request cùng mili-giây. Đổi sang sequence Postgres hoặc ULID/nanoid, và xử lý `P2002`.
- [ ] **A5.** Giá lấy từ cart đọc **ngoài** transaction, trong khi `lockProductsForUpdate` trả về `price` mà không dùng. Dùng giá từ dòng đã khoá (hoặc đọc lại cart trong transaction), và thêm test đổi giá song song với checkout.
- [ ] **A6.** Idempotency, phần Redis:
  - Bọc `try/catch` cho Redis. Middleware async hiện không có try/catch, mà Express 4 không bắt rejection nên request có thể treo.
  - Key `IN_PROGRESS` đang dùng TTL 24h. Server crash giữa chừng thì người dùng bị 409 cả ngày. Cho `IN_PROGRESS` TTL ngắn (30–60 giây).
- [ ] **A7.** Idempotency, phần service: `checkout()` luôn trả `idempotent: false`. Khi gặp `P2002` trên `idempotencyKey` phải trả lại đơn cũ với `idempotent: true`, để DB là lớp bảo vệ cuối khi Redis mất key.
- [ ] **A8.** Đọc-sau-ghi: nếu đọc order qua projection thì sau checkout có thể 404 tới ~2 giây. Trả order trực tiếp từ luồng ghi, hoặc đọc từ bảng ghi.

### Auth và bảo mật

- [ ] **B1.** Xoay refresh token phải atomic: `UPDATE ... WHERE revokedAt IS NULL` rồi kiểm tra `count`. Hiện hai request refresh đồng thời có thể cùng thành công. Thêm test race.
- [ ] **B2.** Blacklist đang dùng cả chuỗi JWT làm key Redis. Băm SHA-256 và dùng `jti`. `blacklistAccessToken` đang nuốt lỗi: cần log và quy định fail-open hay fail-closed khi Redis chết.
- [ ] **B3.** JWT thiếu `iss`, `aud`, `jti`, `typ` (access/refresh/preauth). Thêm và kiểm tra khi verify.
- [ ] **B4.** `/metrics` đang mở công khai. Hạn chế theo mạng / IP allowlist / basic auth hoặc port riêng. `/api/docs` nên tắt hoặc bảo vệ ở production.
- [ ] **B5.** `json({ limit: "10mb" })` áp dụng toàn cục. Đặt mặc định ~100kb, chỉ nới cho route cần.
- [ ] **B6.** CSRF double-submit hiện là token ngẫu nhiên không ràng buộc phiên. Chuyển sang token ký HMAC gắn session. `COOKIE_DOMAIN` đang đọc thẳng `process.env`, đưa vào config schema.
- [ ] **B7.** Rate limit:
  - `skip: req.path === "/health"` là dead config vì limiter gắn ở `/api`.
  - Quyết định `passOnStoreError` khi Redis lỗi.
  - Thêm khoá theo tài khoản, không chỉ `ip+email`.
  - Thêm limiter cho verify-email và resend.
- [ ] **B8.** Upload chỉ kiểm tra `mimetype` do client gửi. Kiểm tra magic bytes (ví dụ `sharp.metadata()`). `/uploads` static và thư mục `uploads/tmp` có vẻ là di sản khi ảnh đã lên Cloudinary; xoá hoặc chuyển sang object storage.
- [ ] **B9.** Fallback secret cho môi trường test đang nằm trong `src/config/index.ts` (production code). Chuyển sang `tests/setup.ts`.
- [ ] **B10.** Chạy `npm audit`, nâng `multer 1.x` lên bản đã vá _(cần kiểm tra advisory hiện hành)_.

---

## P1. Kiến trúc: làm cho các tuyên bố trong README thành sự thật

### CQRS và outbox

- [ ] **C1.** Quyết định một trong hai hướng cho projection. **Giữ:** nối `CatalogReadPort`, `OrderHistoryReadPort`, `DashboardReadPort` vào adapter đọc bảng projection ở composition root. **Bỏ:** xoá projection và `refreshDashboard` (hiện chạy 6 query cho mỗi event mà không ai đọc).
- [x] **C2.** ~~Nếu giữ, sửa dữ liệu projection~~ — **Đã xong (xác minh 29/09).** `paymentStatus`, `subtotal`, `tax`, `shippingFee`, `placedAt` giờ lấy thật từ `OrderPlacedEvent` (được `Order.place()` tính đúng từ aggregate), không còn gán cứng. Có sẵn `rebuildOrderHistoryProjection` (`src/core/outbox/rebuild-order-history-projection.ts` + `scripts/rebuild-order-history-projection.ts`) đọc lại từ bảng `order` gốc để backfill dữ liệu cũ đã sai, có test riêng. Còn thiếu:
  - Script chưa được khai báo thành lệnh `npm run` trong `package.json`.
  - `OPERATIONS.md` chưa có hướng dẫn cụ thể khi nào/cách nào chạy lệnh backfill này.
  - `sourceVersion` để xử lý event sai thứ tự vẫn chưa có cho `orderHistoryProjection` (chỉ `productCatalogProjection` có `sourceVersion`); `updateOrderStatus` vẫn dùng `updateMany` im lặng khi không tìm thấy row.
  - Dashboard (`refreshDashboard`) vẫn tính lại toàn bộ từ đầu mỗi lần, chưa theo delta — xem thêm L1 ở P8 về định nghĩa doanh thu sai trong chính hàm này.
- [ ] **C3.** Outbox đảm bảo thứ tự theo aggregate (không claim event nếu còn event cũ chưa publish của cùng aggregate). Với nhiều relay instance, thứ tự hiện không được bảo đảm.
- [ ] **C4.** `outboxLagSeconds` đang tính trên row vừa claim, nên khi mọi event đang backoff nó hiện 0. Đổi thành `now - min(occurredAt)` của các event chưa publish (truy vấn riêng), thêm gauge cho số dead-letter.
- [ ] **C5.** Lease 60 giây cho batch 50 row xử lý tuần tự có thể hết hạn giữa chừng. Đặt lease theo từng row, hoặc heartbeat, hoặc giảm batch.
- [ ] **C6.** Có công cụ replay dead-letter (CLI hoặc endpoint admin), job dọn row đã publish, và index phù hợp cho truy vấn claim _(cần kiểm tra schema)_.
- [ ] **C7.** `withRetry` bọc `eventBus.publish` không có tác dụng vì `publish` không throw mà trả `result`. Bỏ hoặc sửa. Handler có side-effect (email) phải idempotent bằng `jobId = eventId + handler`.
- [ ] **C8.** Validate payload khi deserialize event bằng zod thay vì ép kiểu, và thêm `schemaVersion` cho event.

### Ranh giới và DI

- [ ] **D1.** Kiểm tra ranh giới bằng `dependency-cruiser` hoặc `eslint-plugin-boundaries`, chạy trong CI. Quy tắc: domain không import infra; application không import `prisma`/`metrics`/`tracing`; module chỉ import nhau qua public API.
- [ ] **D2.** Application layer đang import trực tiếp `metrics.registry` và `tracing`. Tạo `MetricsPort` và `TracerPort` rồi inject.
- [ ] **D3.** Repository đang dùng Prisma singleton toàn cục. Inject `PrismaClient` qua constructor.
- [ ] **D4.** Implement Unit of Work thật (`uow.run(ctx => ...)`), bỏ `CheckoutTransaction` mờ và các cast `as unknown as`. Nếu không làm, xoá thư mục `core/unit-of-work` và bỏ Unit of Work khỏi README.
- [ ] **D5.** Controller và service nên phụ thuộc interface (`IAuthService`…) thay vì class cụ thể, và `TOKENS` nên gắn với interface.
- [ ] **D6.** Composition root:
  - Chỉ giữ một `container.ts` (hiện có `src/container.ts` và `core/di/container.ts`).
  - Tách theo module (`registerAuthModule(container)`).
  - Không chạy side effect lúc import; export `buildApp(container)`.
  - Route file không import từ `@/container`; dùng factory `createAuthRoutes(controller)`.
  - `health.routes.ts` đang tự `new` service, đưa vào DI.
- [ ] **D7.** `AuthRepository` và `AuthSessionUser` đăng ký hai instance riêng của cùng một class. Dùng chung một instance.
- [ ] **D8.** `Lifetime.Scoped` và `request.scope.middleware` có vẻ chưa thực sự được dùng _(cần kiểm tra)_. Nếu vậy, dùng hoặc bỏ.

### Lỗi và ranh giới lớp

- [ ] **E1.** Hai hệ thống lỗi song song. `AppError` (mang HTTP status) đang nằm trong file middleware và bị service import (`BadRequestError`), nên application layer biết mã HTTP. Chuyển sang lỗi ứng dụng có `code`, ánh xạ sang HTTP chỉ ở tầng presentation.
- [ ] **E2.** `StockReservationService` ném `BadRequestError` dù domain đã có `InsufficientStockError`. Dùng lỗi domain.

### Saga

- [ ] **F1.** Hoặc nối `CheckoutSaga` và `CancellationRefundSaga` vào luồng thật (kèm payment port có adapter giả để demo, có flag), hoặc gỡ Saga khỏi README và ADR. Hiện README nói "Production factories wire both Sagas" còn `OPERATIONS.md` nói ngược lại.

---

## P2. Mô hình domain và OOP (phần quyết định chữ "10")

- [ ] **G1.** `Order.total` bóc `Money` ra số rồi tính. Dùng `subtotal.add(tax).add(shipping).subtract(discount)` trong `Money`. Bỏ `Math.max(0, …)` bằng invariant rõ ràng.
- [ ] **G2.** `Money`:
  - Thêm `equals`, `isZero`, `greaterThan`, `Money.zero()`, `sum`, `allocate`.
  - Ném `DomainError` thay vì `Error`.
  - Tách `Currency` thành value object và xử lý số chữ số thập phân theo currency (`Math.round` hiện chỉ đúng với VND).
- [ ] **G3.** `paymentMethod` và `paymentStatus` là string. Tạo `PaymentMethod` và `PaymentStatus` (enum kèm bảng chuyển trạng thái), cùng hành vi `markPaid()` và `refund()`.
- [ ] **G4.** Trạng thái `REFUNDED` không có transition nào dẫn tới. Bổ sung hoặc xoá.
- [ ] **G5.** Bảng transition của `Order` đang được tạo lại mỗi lần gọi. Đưa thành `static readonly`, hoặc dùng State pattern nếu hành vi mỗi trạng thái khác nhau.
- [ ] **G6.** `hydrate()` luôn đặt `_placed = true`, và `_placed` trùng thông tin với `status`. Suy ra từ status và bỏ cờ.
- [ ] **G7.** `addItem` khi trùng sản phẩm sẽ ghi đè `unitPrice` bằng giá mới một cách im lặng. Bắt buộc cùng giá hoặc ném lỗi.
- [ ] **G8.** `cancel()` raise cả `OrderStatusChangedEvent` lẫn `OrderCancelledEvent`. Chọn một nguồn sự thật và document lý do.
- [ ] **G9.** `AggregateRoot.version` đang tăng theo số event, không phải version phục vụ concurrency. Tách `version` (lưu DB, optimistic lock) khỏi số thứ tự event.
- [ ] **G10.** Tách `PricingService` thành chính sách domain dùng Strategy: `TaxPolicy`, `ShippingPolicy`, `DiscountStrategy` (Percentage/Fixed). Cách này cũng làm claim "Strategy pattern" trong README thành thật. Cân nhắc Strategy cho `PaymentMethod` nếu README vẫn giữ claim đó.
- [ ] **G11.** Inject `Clock` và `IdGenerator` thay cho `new Date()` và `crypto.randomUUID()` rải trong domain/service, để test xác định được.
- [ ] **G12.** Repository trả về aggregate (qua mapper Persistence ↔ Domain ↔ DTO) thay vì model Prisma ép kiểu `as unknown as`. README tuyên bố có mapper, nhưng thực tế chỉ có ở auth và products.
- [ ] **G13.** `Address` là string. Cấu trúc hoá (đường, phường, quận, tỉnh) hoặc ghi rõ đây là quyết định đơn giản hoá.
- [ ] **G14.** Reviews, Wishlist, Notifications không có entity domain. Hoặc làm aggregate có invariant thật (không trùng, giới hạn), hoặc sửa README thành "CRUD module có chủ đích". Không phải mọi module đều cần DDD, nhưng tài liệu phải khớp.
- [ ] **G15.** Application services quá to (ví dụ `AuthService` nhiều dependency). Tách thành use case theo hành động (`PlaceOrderUseCase`, `RefreshSessionUseCase`) để đúng SRP.
- [ ] **G16.** Event bus: tách `IEventBus` port; định kiểu event theo map (không dùng chuỗi tên tự do); đăng ký handler theo module thay vì một khối `subscribe` dài trong `container.ts`.

---

## P3. Clean code và dọn dẹp

- [ ] **H1.** Xoá code chết:
  - `createOrder` và `createOrderItems` trong `PrismaCheckoutRepository`.
  - Thư mục rỗng `checkout/domain/` và `core/unit-of-work/`.
  - File lạc `tests/unit/shared/domain/event-bus/event-bus.port.ts`.
  - Flag `NewCheckoutFlow` chỉ dùng làm span attribute.
- [ ] **H2.** Trùng lặp chức năng: `CheckoutService.getOrders/getOrder` và `OrdersService.getOrders/getOrderById` (hai API `/api/checkout/orders` và `/api/orders`). Chọn một nguồn.
- [ ] **H3.** Sửa log message trỏ tới file không tồn tại (`prisma/schema.additions.prisma`).
- [ ] **H4.** Thống nhất quy ước tên interface (`IOrdersRepository` và `OutboxRelayStore`/`TokenStorePort` đang lẫn lộn) và tên file (`.port.ts` / `-models.ts`).
- [ ] **H5.** Thống nhất ngôn ngữ comment và tài liệu (hiện lẫn Việt/Anh). Với portfolio gửi công ty nước ngoài, dùng tiếng Anh cho code và README chính.
- [ ] **H6.** Đưa magic number (`POLL_INTERVAL_MS`, `BATCH_SIZE`, `MAX_RETRIES`, lease…) vào config có kiểu.
- [ ] **H7.** Loại 14 chỗ `as unknown as`/`any`, thay 2 `console.*` bằng logger.
- [ ] **H8.** Bật thêm cờ TS: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`. Bỏ `experimentalDecorators` và `emitDecoratorMetadata` (không dùng decorator), bỏ config bị comment trong `tsconfig.json`.
- [ ] **H9.** Ba cơ chế alias (`module-alias`, `tsconfig-paths`, `tsc-alias`). Giữ một cách, xoá `_moduleAliases` nếu không dùng.
- [ ] **H10.** Chia nhỏ file lớn: `src/container.ts` (14KB), `tokens.ts` (8KB), `domain-error.ts` (6KB) theo module.
- [ ] **H11.** ESLint đang ở v8 với `@typescript-eslint` v6. Nâng cấp và bật `no-explicit-any`, `no-floating-promises`, `import/no-cycle`, `complexity`, `max-lines-per-function` _(cần kiểm tra `.eslintrc`)_.
- [ ] **H12.** Dependencies:
  - `@prisma/adapter-pg ^7` đi với `@prisma/client ^5.22` (lệch phiên bản).
  - `@types/*` nằm trong `dependencies` (bcrypt, cookie-parser, jsonwebtoken, nodemailer, speakeasy).
  - `@types/helmet`, `@types/sharp` đã deprecated; `@types/uuid` khi không có `uuid`.
  - `@types/node ^26` lệch với Node ≥20.
  - `body-parser` thừa với Express.
  - `dotenv` bị load hai lần.
  - `async-retry`, `opossum` và `withRetry` tự viết chồng chéo. Chọn một.
- [ ] **H13.** Xác nhận `passport-*` và các package khác có thực sự được dùng (`npm ls` / `depcheck`).

---

## P4. Kiểm thử

- [ ] **T1.** Thêm test end-to-end bằng `supertest` cho luồng chính: register → login → cart → checkout → đổi trạng thái đơn. Hiện `supertest` có trong devDependencies nhưng chỉ thấy `app.csrf.test.ts` dùng app thật.
- [ ] **T2.** Test tích hợp còn thiếu (README nói có test Outbox nhưng danh sách file không có):
  - `OutboxRelay` với Postgres thật (2 instance chạy song song, lease hết hạn, dead-letter, thứ tự).
  - `idempotencyMiddleware` với Redis thật.
  - Orders repository.
  - Refresh token race.
  - Retry `P2034`.
  - Đổi giá song song với checkout.
- [ ] **T3.** Contract test OpenAPI hiện chỉ 621B, gần như tượng trưng. Kiểm tra response thật so với schema; cân nhắc sinh OpenAPI từ zod (`zod-to-openapi`) thay vì viết tay các file `*.swagger.ts` để tránh lệch. Có thể thêm Pact với frontend.
- [ ] **T4.** Mutation testing (Stryker) cho `domain/` và `value-objects/`, đặt ngưỡng trong CI.
- [ ] **T5.** Đặt ngưỡng coverage trong config vitest và cho CI fail khi tụt _(cần kiểm tra config)_.
- [ ] **T6.** Mở rộng `chaos-outbox.ts` (hiện 885B) thành kịch bản chạy trong CI: kill relay giữa batch, mất kết nối DB.
- [ ] **T7.** Load test bằng k6 cho checkout với sản phẩm "hot"; lưu kết quả vào `docs/` (rất hợp để đưa vào CV).
- [ ] **T8.** Dùng test data builder (Object Mother) và in-memory fake repository cho service test thay vì mock từng lời gọi.
- [ ] **T9.** Kiểm tra kiến trúc như test (`dependency-cruiser` trong CI, xem D1).

---

## P5. Đóng gói, CI/CD và vận hành production

- [ ] **I1.** `docker-compose.prod.yml` sẽ **không khởi động được** nếu không sửa: `config` bắt buộc `SMTP_*` và `CLOUDINARY_*` ở production, còn compose không truyền các biến này (cũng thiếu `FRONTEND_URL`, `CORS_ORIGIN`).
- [ ] **I2.** `docker-compose.prod.yml` còn:
  - Mount `./otel-collector-config.yml` không có trong repo.
  - Port `3000` trong khi port mặc định là `5000`.
  - Volume `product-images` khai báo nhưng không dùng.
  - Thiếu healthcheck, giới hạn tài nguyên, và bước chạy `prisma migrate deploy`.
- [ ] **I3.** `docker-compose.yml` (dev): `version: "3.8"` đã lỗi thời; mount `./nodemon.json` không có trong repo (Docker sẽ tạo thư mục rỗng); bind cổng Postgres/Redis vào `127.0.0.1`; `QUEUE_REDIS_URL` được set nhưng config schema có vẻ không có _(cần kiểm tra)_.
- [ ] **I4.** `Dockerfile` _(cần kiểm tra vì không có trong export)_: multi-stage, user non-root, `npm ci --omit=dev`, `HEALTHCHECK`, ghim phiên bản/digest base image, `.dockerignore`.
- [ ] **I5.** Tách worker: relay và BullMQ worker đang chạy trong tiến trình API (`server.ts`). Thêm entrypoint `worker.ts` hoặc cờ `RUN_RELAY` / `RUN_WORKERS` để scale riêng.
- [ ] **I6.** Graceful shutdown: đảm bảo readiness trả 503 trước khi đóng, và đóng đủ queue, Redis, Prisma _(cần đọc hết `server.ts`)_.
- [ ] **I7.** CI (có `quality-gates.yml`, chưa đọc được): chạy cả integration test (Testcontainers cần Docker), `npm audit`, CodeQL, Dependabot hoặc Renovate, build Docker image, kiểm tra schema drift (`prisma migrate diff`), commitlint, upload coverage.
- [ ] **I8.** Quản lý phát hành: tag `v1.0.0`, `CHANGELOG.md`, semver, branch protection. Repo có 480 commit nhưng chưa có release nào.
- [ ] **I9.** Cấu hình hạ tầng dữ liệu: `connection_limit` của Prisma, `statement_timeout`, `idle_in_transaction_session_timeout`, chính sách backup, `maxmemory-policy noeviction` cho Redis dùng với BullMQ (tách Redis cache/rate-limit khỏi queue).
- [ ] **I10.** Bí mật: dùng Docker/Kubernetes secrets thay vì biến môi trường thuần; xác nhận `.env.example` đầy đủ và không chứa giá trị thật _(cần kiểm tra)_.

---

## P6. Quan sát và API

- [ ] **J1.** Log có `trace_id` liên kết với OpenTelemetry; metric HTTP dùng route pattern (không dùng URL thô để tránh cardinality cao).
- [ ] **J2.** Thêm dashboard Grafana (JSON commit trong repo), cảnh báo dựa trên SLO (burn-rate), và link runbook trong `alerts.yml`.
- [ ] **J3.** Audit log cho hành động admin (đổi trạng thái đơn, xoá sản phẩm).
- [ ] **J4.** Versioning API (`/api/v1`), cursor pagination cho danh sách lớn, mã lỗi được liệt kê trong tài liệu.

---

## P7. Tài liệu và cách trình bày trong CV

- [ ] **K1.** Viết lại README cho khớp code:
  - Một hệ đánh số duy nhất (hiện có ba mục "10").
  - ADR-003 xuất hiện hai lần với nội dung khác nhau.
  - Sửa `/api-docs` thành `/api/docs`.
  - Sửa "Internal / Private" (repo đang public) và thêm `LICENSE`.
  - Thêm mục **Known limitations**. Phần Trade-offs trong `ARCHITECTURE.md` đã tốt, hãy dùng cùng tinh thần thành thật đó.
  - Bỏ tự nhận "Tech Lead Level" và các dấu ✅ khi chưa đủ bằng chứng.
- [ ] **K2.** Tách ADR thành `docs/adr/0001-….md` (Status / Context / Decision / Consequences), không nhân đôi giữa README và `ARCHITECTURE.md`.
- [ ] **K3.** Thêm mô tả repo, topics, sơ đồ kiến trúc dạng ảnh, ví dụ `curl`, link sang repo frontend, `SECURITY.md`, `CONTRIBUTING.md`.
- [ ] **K4.** Deploy bản demo (Render / Fly / Railway) và đưa link Swagger vào README. Người tuyển dụng thường chạy thử thay vì đọc code.
- [ ] **K5.** Ghi vào CV những số liệu đo được: kết quả k6, số test, coverage, mutation score. Ví dụ: "chống oversell bằng khoá dòng + optimistic version, kiểm chứng bằng test đồng thời".

---

## Tiêu chí "xong" để tự tin nói 9–10/10

- [ ] Mọi domain event đi qua outbox, có test kill-process chứng minh không mất event.
- [ ] `dependency-cruiser` đạt trong CI; không còn `any` / `as unknown as` ngoài một ranh giới adapter hẹp.
- [ ] Domain (Order, Product, Money) có bảng transition rõ, không còn primitive obsession ở tiền và thanh toán.
- [ ] Projection hoặc được đọc thật, hoặc đã bị gỡ.
- [ ] Mỗi khẳng định trong README trỏ được tới một test hoặc một file cụ thể.
- [ ] `docker compose -f docker-compose.prod.yml up` chạy được từ đầu, có demo trực tuyến.
- [ ] Có số liệu tải (k6) và mutation score cho domain.

> Lưu ý: khó chạm 10 tuyệt đối chỉ bằng code. Điểm cuối thường đến từ thứ không nằm trong repo: chạy trên môi trường thật với tải thật, và được người khác review. Làm hết danh sách này thì 9/10 là mục tiêu hợp lý.

## P8. Phát hiện mới (từ đối chiếu với checklist AI khác, đã tự xác minh trong code)

- [ ] **L1. Định nghĩa "doanh thu" sai và không nhất quán giữa hai nơi.** `PrismaDashboardRepository.getTotalRevenue` tính tổng `total` của mọi đơn có `status != CANCELLED`, không lọc theo `paymentStatus` — nghĩa là đơn COD chưa thu tiền vẫn tính vào doanh thu. `refreshDashboard` (projection) còn tính tổng **toàn bộ đơn**, không lọc trạng thái nào. Hai nơi ra hai con số khác nhau, và cả hai đều không phản ánh tiền đã thực thu. Quyết định rõ "doanh thu" = tổng đơn đã `PAID`, hay tổng giá trị đơn không huỷ, rồi áp dụng thống nhất ở cả repository chính và projection.
- [ ] **L2. `existsAndActive` không kiểm tra `isActive`.** Trong `prisma-products.repository.ts`, hàm chỉ kiểm tra sản phẩm có tồn tại (`findUnique` rồi `!== null`), không lọc `isActive: true`. Bất kỳ chỗ nào dùng hàm này để xác nhận "sản phẩm đang bán" trước khi cho thêm vào giỏ/đặt hàng đều có thể chấp nhận sản phẩm đã bị ẩn/xoá mềm. Sửa thành `findUnique({ where: { id, isActive: true } })`.
- [ ] **L3. Ngưỡng miễn phí vận chuyển: xác nhận lại giữa backend và frontend.** Backend (`pricing.service.ts`) dùng so sánh chặt: `subtotal > FREE_SHIPPING_THRESHOLD` (đúng bằng ngưỡng thì **không** miễn phí ship). Nếu frontend hiển thị dùng `>=`, số tiền hiển thị lúc thanh toán sẽ khác số tiền server tính đúng tại mốc ngưỡng. Cần đối chiếu code frontend `CheckoutRenderer.js` để xác nhận, sau đó thống nhất một chiều — tốt nhất là để server luôn là nguồn sự thật và frontend chỉ hiển thị lại kết quả server trả về, không tự tính lại (xem cả mục C-tương-đương ở phần độ tin cậy).

## Thứ tự đề xuất

1. **P0** trước: A1–A7, B1–B4.
2. **C1** (quyết định số phận của projection).
3. **D1–D6** và **G1–G9**.
4. **P4** (kiểm thử) và **P5** (đóng gói, CI/CD).
5. Cuối cùng: **README, demo và số liệu cho CV** (P7).
