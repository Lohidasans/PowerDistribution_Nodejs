var express = require("express");
var router = express.Router();
const svc = require("../services/productService");

// CRUD
router.post("/products", svc.createProduct);
router.get("/products", svc.getAllProducts);
router.get("/products/list-website-details", svc.getProductsForWebsiteList);
router.get("/products/search/sku", svc.searchProductBySkuNew);
router.post("/products/generateSku", svc.createProductSKUCode);
router.get("/products/list-details", svc.getAllProductDetails);
router.get("/products/addon-list", svc.getProductAddonList);
router.get("/product-id-by-sku", svc.getProductIdBySku);
router.get("/products/:id", svc.getProductById);
router.put("/products/:id", svc.updateProduct);
router.delete("/products/:id", svc.deleteProduct);
router.patch("/products/:id/status", svc.updateProductStatus);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Product
 *     description: Product management
 */
/**
 * @openapi
 * /api/v1/products/generateSku:
 *   post:
 *     summary: Generate a new SKU ID
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: branch_no
 *         required: true
 *         schema: { type: string }
 *         description: Branch code prefix (e.g., CJ_MDU_01)
 *     description: Returns a unique SKU like CJ_MDU_01_001 using the provided branch_no.
 *     responses:
 *       200:
 *         description: Generated SKU
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SkuResponse'
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
 * /api/v1/products/details:
 *   get:
 *     summary: Get detailed product rows (product + items + additional details)
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: product_id
 *         required: true
 *         schema: { type: integer }
 *         description: Product ID to fetch
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

/**
 * @openapi
 * /api/v1/products/{id}:
 *   get:
 *     summary: Get a product by ID
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/products/{id}:
 *   put:
 *     summary: Update a product by ID
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductCreateInput'
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/products/{id}:
 *   delete:
 *     summary: Delete a product by ID
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
/**
 * @openapi
 * /api/v1/products/list-details:
 *   get:
 *     summary: Get products for web list with filters and search (includes variation_count)
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: material_type_id
 *         schema: { type: integer }
 *       - in: query
 *         name: category_id
 *         schema: { type: integer }
 *       - in: query
 *         name: subcategory_id
 *         schema: { type: integer }
 *       - in: query
 *         name: vendor_id
 *         schema: { type: integer }
 *       - in: query
 *         name: product_type
 *         schema: { type: string, enum: ["Weight Based", "Piece Rate"] }
 *       - in: query
 *         name: is_published
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive search across product fields
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductListDetailsResponse'
 */
/**
 * @openapi
 * /api/v1/products/addon-list:
 *   get:
 *     summary: Get lightweight product list for Add-On picker with search
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search across sku_id, product_name, description
 *       - in: query
 *         name: sku_id
 *         schema: { type: string }
 *         description: Optional explicit SKU filter (ILIKE)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductAddonListResponse'
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
 * /api/v1/products/details:
 *   get:
 *     summary: Get detailed product rows (product + items + additional details)
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: product_id
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
