var express = require("express");
var router = express.Router();
const svc = require("../services/productVariantService");

// Bulk create
router.post("/product-variants/bulk", svc.createProductVariantsBulk);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: ProductVariant
 *     description: Product variant mapping (IDs)
 */

/**
 * @openapi
 * /api/v1/product-variants/bulk:
 *   post:
 *     summary: Bulk create product variant mappings using IDs
 *     tags: [ProductVariant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id: { type: integer }
 *                     variant_id: { type: integer }
 *                     variant_type_ids:
 *                       type: array
 *                       items: { type: integer }
 *     responses:
 *       201:
 *         description: Created
 */
