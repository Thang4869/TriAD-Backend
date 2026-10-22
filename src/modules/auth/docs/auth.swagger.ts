/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & authorization endpoints
 *
 * components:
 *   securitySchemes:
 *     refreshCookie:
 *       type: apiKey
 *       in: cookie
 *       name: refreshToken
 *
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập bằng email/password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: JWT trong cookie HttpOnly; user và CSRF trong JSON
 *       401:
 *         description: Sai email hoặc mật khẩu
 *
 * /api/auth/refresh:
 *   post:
 *     summary: Xoay refresh token và cấp lại cookie đăng nhập
 *     description: Dùng refreshToken cookie HttpOnly hoặc token trong body. Cookie được ưu tiên; thiếu cả hai trả 400. Request dùng cookie phải gửi CSRF hợp lệ. JWT mới chỉ được đặt trong cookie HttpOnly.
 *     tags: [Auth]
 *     security:
 *       - refreshCookie: []
 *       - {}
 *     parameters:
 *       - in: header
 *         name: x-csrf-token
 *         required: false
 *         description: Bắt buộc khi dùng cookie đăng nhập
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 minLength: 1
 *                 description: Credential cho client dùng body; không cần gửi lại cookie HttpOnly qua JSON
 *     responses:
 *       200:
 *         description: Xoay token thành công; đặt cookie và trả user/CSRF
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   required: [user, csrfToken]
 *                   properties:
 *                     user: { type: object }
 *                     csrfToken: { type: string }
 *       400:
 *         description: Thiếu credential hoặc body không hợp lệ
 *       401:
 *         description: Refresh token hết hạn, bị thu hồi hoặc không hợp lệ
 *       403:
 *         description: CSRF hoặc origin không hợp lệ
 *       429:
 *         description: Vượt giới hạn refresh
 *       503:
 *         description: Hạ tầng xác thực tạm thời không khả dụng
 */
export {};
