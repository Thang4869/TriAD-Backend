/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Xem đơn hàng (user) và quản trị đơn hàng (admin)
 *
 * /api/orders:
 *   get:
 *     summary: Lấy danh sách đơn hàng của user hiện tại
 *     tags: [Orders]
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
 *         description: Danh sách đơn hàng có phân trang
 *
 * /api/orders/{orderId}:
 *   get:
 *     summary: Lấy chi tiết 1 đơn hàng của user hiện tại
 *     tags: [Orders]
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
 *         description: Không tìm thấy đơn hàng
 *
 * /api/orders/admin/all:
 *   get:
 *     summary: "[Admin] Lấy toàn bộ đơn hàng trong hệ thống, có filter"
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED] }
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Danh sách đơn hàng toàn hệ thống
 *       403:
 *         description: Không có quyền admin
 *
 * /api/orders/admin/{orderId}/status:
 *   patch:
 *     summary: "[Admin] Cập nhật trạng thái đơn hàng"
 *     tags: [Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED] }
 *     responses:
 *       200:
 *         description: Trạng thái đã được cập nhật
 *       403:
 *         description: Không có quyền admin
 *       404:
 *         description: Không tìm thấy đơn hàng
 */
export {};
