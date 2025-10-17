var express = require("express");
var variantRouter = express.Router();
const variantService = require("../services/variantService");

variantRouter.post("/variant", variantService.createVariant);
variantRouter.delete("/variant/:id", variantService.deleteVariant);
variantRouter.get("/variants", variantService.listVariantWithValues);

module.exports = variantRouter;

/**
 * @openapi
 * tags:
 *   - name: Variant
 *     description: Variant and variant value management
 */

/**
 * @openapi
 * /api/v1/variants:
 *   get:
 *     summary: List variants with their values (aggregated)
 *     tags: [Variant]
 *     responses:
 *       200:
 *         description: OK
 */

/**
  * @openapi
 * /api/v1/variant:
 *   post:
 *     summary: Create a new variant with its associated values
 *     tags: [Variant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VariantCreateInput'
 *           example:
 *             product_id: 3
 *             variant_type: "Size"
 *             values: ["Small", "Medium", "Large"]
 *     responses:
 *       201:
 *         description: Variant created successfully with its values
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Missing required fields or invalid input
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/v1/variant/{id}:
 *   delete:
 *     summary: Delete a variant (and its values)
 *     tags: [Variant]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Variant and its values deleted successfully
 */
