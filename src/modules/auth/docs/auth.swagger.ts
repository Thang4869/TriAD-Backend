/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & authorization endpoints
 *
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       required: [success, error, correlationId]
 *       properties:
 *         success: { type: boolean, enum: [false] }
 *         error: { type: string }
 *         code: { type: string }
 *         correlationId: { type: string }
 *         details: {}
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
 *               password: { type: string, format: password, minLength: 6 }
 *     responses:
 *       200:
 *         description: JWT trong cookie HttpOnly; user và CSRF trong JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 data:
 *                   type: object
 *                   required: [user, csrfToken]
 *                   properties:
 *                     user: { type: object }
 *                     csrfToken: { type: string }
 *                     requires2FA: { type: boolean }
 *                     preAuthToken: { type: string }
 *       401:
 *         description: Sai email hoặc mật khẩu
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 6 }
 *               firstName: { type: string, minLength: 1 }
 *               lastName: { type: string, minLength: 1 }
 *               phone: { type: string }
 *     responses:
 *       201:
 *         description: Tài khoản đã được tạo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 data:
 *                   type: object
 *                   required: [user]
 *                   properties:
 *                     user: { type: object }
 *       400:
 *         description: Dữ liệu không hợp lệ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Email đã tồn tại
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, enum: [true] }
 *                 data:
 *                   type: object
 *                   required: [user, csrfToken]
 *                   properties:
 *                     user: { type: object }
 *                     csrfToken: { type: string }
 *       400:
 *         description: Thiếu credential hoặc body không hợp lệ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Refresh token hết hạn, bị thu hồi hoặc không hợp lệ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: CSRF hoặc origin không hợp lệ
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       429:
 *         description: Vượt giới hạn refresh
 *       503:
 *         description: Hạ tầng xác thực tạm thời không khả dụng
 */
export {};
