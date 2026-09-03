/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Hồ sơ cá nhân của user đang đăng nhập
 *
 * /api/users/me:
 *   get:
 *     summary: Lấy thông tin hồ sơ cá nhân
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Thông tin user hiện tại
 *       401:
 *         description: Chưa đăng nhập
 *   put:
 *     summary: Cập nhật thông tin hồ sơ cá nhân
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: Hồ sơ đã được cập nhật
 *
 * /api/users/me/password:
 *   put:
 *     summary: Đổi mật khẩu
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, minLength: 6 }
 *               newPassword: { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mật khẩu hiện tại không đúng
 */
export {};
