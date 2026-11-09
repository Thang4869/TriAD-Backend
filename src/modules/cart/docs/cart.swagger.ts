/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Quản lý giỏ hàng của người dùng đang đăng nhập
 *
 * components:
 *   schemas:
 *     CartItem:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         productId: { type: string, description: UUID or legacy CUID }
 *         quantity: { type: integer, example: 2 }
 *         product:
 *           type: object
 *           properties:
 *             name: { type: string }
 *             price: { type: number }
 *     Cart:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/CartItem' }
 *
 * /api/cart:
 *   get:
 *     summary: Lấy giỏ hàng hiện tại của user
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Thông tin giỏ hàng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Cart' }
 *       401:
 *         description: Chưa đăng nhập
 *   delete:
 *     summary: Xoá toàn bộ item trong giỏ hàng
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Giỏ hàng đã được làm trống
 *
 * /api/cart/items:
 *   post:
 *     summary: Thêm sản phẩm vào giỏ hàng
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId:
 *                 oneOf:
 *                   - { type: string, format: uuid }
 *                   - { type: string, pattern: '^c[a-z0-9]{24}$' }
 *               quantity: { type: integer, minimum: 1, example: 1 }
 *     responses:
 *       201:
 *         description: Item đã được thêm/gộp vào giỏ hàng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 data: { $ref: '#/components/schemas/CartItem' }
 *       400:
 *         description: Dữ liệu không hợp lệ (productId sai định dạng, quantity <= 0)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Sản phẩm không tồn tại
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/cart/items/{productId}:
 *   put:
 *     summary: Cập nhật số lượng 1 sản phẩm trong giỏ hàng
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           oneOf:
 *             - { type: string, format: uuid }
 *             - { type: string, pattern: '^c[a-z0-9]{24}$' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity: { type: integer, minimum: 0, description: "0 để xoá item khỏi giỏ" }
 *     responses:
 *       200:
 *         description: Số lượng đã được cập nhật
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 data: { $ref: '#/components/schemas/CartItem' }
 *       404:
 *         description: Item không tồn tại trong giỏ hàng
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     summary: Xoá 1 sản phẩm khỏi giỏ hàng
 *     tags: [Cart]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Item đã bị xoá
 *       404:
 *         description: Item không tồn tại trong giỏ hàng
 */
export {};
