/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Đánh giá sản phẩm
 *
 * /api/reviews/product/{productId}:
 *   get:
 *     summary: Lấy danh sách đánh giá của 1 sản phẩm
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Danh sách đánh giá có phân trang
 *
 * /api/reviews:
 *   post:
 *     summary: Tạo đánh giá mới cho sản phẩm (mỗi user chỉ đánh giá 1 lần / sản phẩm)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, rating, content]
 *             properties:
 *               productId: { type: string, format: uuid }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               content: { type: string, minLength: 3 }
 *     responses:
 *       201:
 *         description: Đánh giá đã được tạo
 *       400:
 *         description: User đã đánh giá sản phẩm này rồi
 *       404:
 *         description: Sản phẩm không tồn tại
 *
 * /api/reviews/{reviewId}:
 *   delete:
 *     summary: Xoá đánh giá (chủ sở hữu hoặc admin)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Đánh giá đã bị xoá
 *       403:
 *         description: Không có quyền xoá đánh giá của người khác
 *       404:
 *         description: Không tìm thấy đánh giá
 *
 * /api/reviews/admin/all:
 *   get:
 *     summary: "[Admin] Lấy toàn bộ đánh giá trong hệ thống"
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Danh sách đánh giá toàn hệ thống
 *       403:
 *         description: Không có quyền admin
 */
export {};
