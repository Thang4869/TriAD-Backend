/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: Danh sách sản phẩm yêu thích
 *
 * /api/wishlist:
 *   get:
 *     summary: Lấy danh sách wishlist của user hiện tại
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách wishlist có phân trang
 *   post:
 *     summary: Thêm sản phẩm vào wishlist
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Sản phẩm đã được thêm vào wishlist
 *       404:
 *         description: Sản phẩm không tồn tại
 *
 * /api/wishlist/{productId}:
 *   delete:
 *     summary: Xoá sản phẩm khỏi wishlist
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sản phẩm đã bị xoá khỏi wishlist
 *       404:
 *         description: Sản phẩm không có trong wishlist
 */
export {};
