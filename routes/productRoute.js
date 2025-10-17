var express = require("express");
var router = express.Router();
const svc = require("../services/productService");

// CRUD
router.post("/products", svc.createProduct);
router.get("/products/:id", svc.getProductById);
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
 */
/**
 * @openapi
 * /api/v1/products/{id}:
 *   get:
 *     summary: Get product by ID with item and additional details
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete product (soft)
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
