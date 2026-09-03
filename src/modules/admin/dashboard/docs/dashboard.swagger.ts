/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Thống kê tổng quan cho Admin
 *
 * /api/admin/dashboard/stats:
 *   get:
 *     summary: "[Admin] Lấy số liệu thống kê tổng quan (doanh thu, đơn hàng, user mới...)"
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Số liệu thống kê
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRevenue: { type: number }
 *                     statusBreakdown: { type: object }
 *                     revenueByDay: { type: array, items: { type: object } }
 *                     topSelling: { type: array, items: { type: object } }
 *                     lowStock: { type: array, items: { type: object } }
 *                     newUsers: { type: integer }
 *                     totalUsers: { type: integer }
 *       403:
 *         description: Không có quyền admin
 */
export {};
