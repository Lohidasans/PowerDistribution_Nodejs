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
 *     summary: Bulk create product add-on mappings
 *     tags: [ProductAddOn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductAddOnBulkCreateInput'
 *           example:
 *             product_id: 12
 *             addon_product_ids: [45, 46, 47]
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
