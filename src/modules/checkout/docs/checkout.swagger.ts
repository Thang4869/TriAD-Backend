/**
 * @swagger
 * tags:
 *   name: Checkout
 *   description: Đặt hàng từ giỏ hàng hiện tại
 *
 * /api/checkout:
 *   post:
 *     summary: Tạo đơn hàng từ giỏ hàng (checkout)
 *     description: >
 *       Yêu cầu header `Idempotency-Key` để đảm bảo không tạo trùng đơn hàng khi client
 *       gửi lại request (double-click, network retry...).
 *     tags: [Checkout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema: { type: string }
 *         description: Key duy nhất cho mỗi lần đặt hàng, client tự sinh (nên dùng UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [paymentMethod, address, phone]
 *             properties:
 *               paymentMethod: { type: string, enum: [COD, CARD, BANKING] }
 *               address: { type: string, minLength: 5 }
 *               phone: { type: string, pattern: '^[0-9]{10,11}$' }
 *               notes: { type: string }
 *               discountCode: { type: string }
 *     responses:
 *       201:
 *         description: Đặt hàng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     order: { type: object }
 *                     idempotent: { type: boolean, description: "true nếu đây là kết quả trả về từ 1 request trùng key trước đó" }
 *       400:
 *         description: Giỏ hàng trống hoặc dữ liệu không hợp lệ
 *       409:
 *         description: Hết hàng tồn kho khi giữ chỗ (stock reservation) thất bại
 *
 * /api/checkout/orders:
 *   get:
 *     summary: Lấy danh sách đơn hàng đã đặt của user hiện tại
 *     tags: [Checkout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Danh sách đơn hàng có phân trang
 *
 * /api/checkout/orders/{orderId}:
 *   get:
 *     summary: Lấy chi tiết 1 đơn hàng của user hiện tại
 *     tags: [Checkout]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Chi tiết đơn hàng
 *       404:
 *         description: Đơn hàng không tồn tại hoặc không thuộc về user này
 */
export {};
