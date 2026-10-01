/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Thống kê tổng quan cho Admin
 *
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: "[Admin] Lấy số liệu thống kê tổng quan (GMV, đơn hàng, sản phẩm, người dùng)"
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Số liệu thống kê tổng quan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   required:
 *                     - grossOrderValue
 *                     - orders
 *                     - products
 *                     - users
 *                   properties:
 *                     grossOrderValue:
 *                       type: object
 *                       description: "Gross order value (GMV) của các đơn chưa bị huỷ, không phải doanh thu đã thu tiền"
 *                       properties:
 *                         total30Days:
 *                           type: number
 *                         byDay:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                               grossOrderValue:
 *                                 type: number
 *                               orderCount:
 *                                 type: integer
 *                     orders:
 *                       type: object
 *                       properties:
 *                         statusBreakdown:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                               count:
 *                                 type: integer
 *                     products:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         lowStock:
 *                           type: array
 *                           items:
 *                             type: object
 *                         topSelling:
 *                           type: array
 *                           items:
 *                             type: object
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         new30Days:
 *                           type: integer
 *       403:
 *         description: Không có quyền admin
 */
export {};
