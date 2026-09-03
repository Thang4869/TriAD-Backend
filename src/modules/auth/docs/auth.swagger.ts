/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication & authorization endpoints
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
 *         description: Đăng nhập thành công, trả về access/refresh token
 *       401:
 *         description: Sai email hoặc mật khẩu
 */
export {};
