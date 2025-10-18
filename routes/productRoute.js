var express = require("express");
var router = express.Router();
const svc = require("../services/productService");

// CRUD
router.post("/products", svc.createProduct);
router.get("/products", svc.getAllProducts);
router.get("/products/generateSku", svc.generateSkuId);
router.get("/products/details", svc.getProductDetailRows);
router.get("/products/:id", svc.getProductById);
router.put("/products/:id", svc.updateProduct);
router.delete("/products/:id", svc.deleteProduct);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Product
 *     description: Product management
 */
/**
 * @openapi
 * /api/v1/products:
 *   post:
 *     summary: Create a product (supports item details, additional details and variants)
 *     tags: [Product]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductCreateInput'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
/**
 * @openapi
 * /api/v1/products:
 *   get:
 *     summary: Get all products with pagination and filtering
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive search across string fields
 *       - in: query
 *         name: category_id
 *         schema: { type: integer }
 *         description: Filter by category ID
 *       - in: query
 *         name: subcategory_id
 *         schema: { type: integer }
 *         description: Filter by subcategory ID
 *       - in: query
 *         name: vendor_id
 *         schema: { type: integer }
 *         description: Filter by vendor ID
 *       - in: query
 *         name: material_type_id
 *         schema: { type: integer }
 *         description: Filter by material type ID
 *       - in: query
 *         name: product_type
 *         schema: { type: string, enum: ["Weight Based", "Piece Rate"] }
 *         description: Filter by product type
 *       - in: query
 *         name: is_published
 *         schema: { type: boolean }
 *         description: Filter by published status
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, default: "created_at" }
 *         description: Sort by field
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: ["ASC", "DESC"], default: "DESC" }
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
/**
 * @openapi
 * /api/v1/products/details/{id}:
 *   get:
 *     summary: Get detailed product rows (product + items + additional details)
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Product ID to fetch
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive search across string fields
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductDetailRowsResponse'
 *       204:
 *         description: No Content
 */
