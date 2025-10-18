var express = require("express");
var router = express.Router();
const svc = require("../services/productAddOnService");

// Create mapping between a product and its add-on product
router.post("/product-addons", svc.createProductAddOn);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: ProductAddOn
 *     description: Manage product add-on relationships
 */

/**
 * @openapi
 * /api/v1/product-addons:
 *   post:
 *     summary: Create a product add-on mapping
 *     tags: [ProductAddOn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductAddOnCreateInput'
 *           example:
 *             product_id: 12
 *             addon_product_id: 45
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
