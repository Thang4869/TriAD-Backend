/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Thông báo trong ứng dụng cho user
 *
 * /api/notifications:
 *   get:
 *     summary: Lấy danh sách thông báo của user hiện tại
 *     tags: [Notifications]
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
 *         description: Danh sách thông báo có phân trang
 *
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Đánh dấu 1 thông báo đã đọc
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Thông báo đã được đánh dấu đã đọc
 *       404:
 *         description: Không tìm thấy thông báo
 *
 * /api/notifications/read-all:
 *   put:
 *     summary: Đánh dấu tất cả thông báo là đã đọc
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Tất cả thông báo đã được đánh dấu đã đọc
 */
export {};
