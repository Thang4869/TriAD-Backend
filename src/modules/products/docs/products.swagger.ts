/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Sản phẩm — public catalog & quản trị sản phẩm (admin)
 *
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string }
 *         slug: { type: string }
 *         description: { type: string }
 *         price: { type: number }
 *         stock: { type: integer }
 *         category: { type: string }
 *         images: { type: array, items: { type: string, format: uri } }
 *         avgRating: { type: number, example: 4.5 }
 *         reviewCount: { type: integer, example: 12 }
 *         isActive: { type: boolean }
 *
 * /api/products:
 *   get:
 *     summary: Danh sách sản phẩm public (có filter, tìm kiếm, sắp xếp)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12, maximum: 50 }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, price, name, rating], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Danh sách sản phẩm có phân trang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     products:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Product' }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     totalPages: { type: integer }
 *
 * /api/products/categories:
 *   get:
 *     summary: Lấy danh sách category hiện có
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Danh sách category (dạng mảng string)
 *
 * /api/products/search:
 *   get:
 *     summary: Tìm kiếm sản phẩm theo từ khoá
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 *     responses:
 *       200:
 *         description: Kết quả tìm kiếm
 *
 * /api/products/slug/{slug}:
 *   get:
 *     summary: Lấy chi tiết sản phẩm theo slug (dùng cho trang chi tiết SEO-friendly)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết sản phẩm
 *       404:
 *         description: Không tìm thấy sản phẩm
 *
 * /api/products/{id}:
 *   get:
 *     summary: Lấy chi tiết sản phẩm theo ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Chi tiết sản phẩm
 *       404:
 *         description: Không tìm thấy sản phẩm
 *
 * /api/products/admin/all:
 *   get:
 *     summary: "[Admin] Danh sách toàn bộ sản phẩm, kể cả inactive"
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Danh sách sản phẩm (admin view)
 *       403:
 *         description: Không có quyền admin
 *   post:
 *     summary: "[Admin] Tạo sản phẩm mới"
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, price, stock, category, images, slug]
 *             properties:
 *               name: { type: string, maxLength: 255 }
 *               description: { type: string }
 *               price: { type: number, minimum: 0.01 }
 *               stock: { type: integer, minimum: 0 }
 *               category: { type: string }
 *               images: { type: array, items: { type: string, format: uri }, minItems: 1 }
 *               slug: { type: string, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }
 *     responses:
 *       201:
 *         description: Sản phẩm đã được tạo
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền admin
 *
 * /api/products/admin/{id}:
 *   put:
 *     summary: "[Admin] Cập nhật sản phẩm"
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: "Bất kỳ field nào của sản phẩm, tối thiểu 1 field"
 *     responses:
 *       200:
 *         description: Sản phẩm đã được cập nhật
 *       404:
 *         description: Không tìm thấy sản phẩm
 *   delete:
 *     summary: "[Admin] Vô hiệu hoá sản phẩm (soft delete)"
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sản phẩm đã bị vô hiệu hoá (isActive=false)
 *       404:
 *         description: Không tìm thấy sản phẩm
 *
 * /api/products/admin/{id}/restore:
 *   patch:
 *     summary: "[Admin] Kích hoạt lại sản phẩm đã bị vô hiệu hoá"
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sản phẩm đã được kích hoạt lại
 *       404:
 *         description: Không tìm thấy sản phẩm
 *
 * /api/products/admin/{id}/images:
 *   post:
 *     summary: "[Admin] Upload ảnh sản phẩm (xử lý bất đồng bộ qua queue)"
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image: { type: string, format: binary, description: "JPEG/PNG/WEBP, tối đa 5MB" }
 *     responses:
 *       202:
 *         description: Ảnh đã được nhận và đưa vào queue xử lý (resize + upload Cloudinary)
 *       400:
 *         description: Thiếu file hoặc sai định dạng
 */
export {};
