var express = require("express");
var variantRouter = express.Router();
const variantService = require("../services/variantService");

variantRouter.post("/variant", variantService.createVariant);
variantRouter.get("/variants", variantService.listVariantWithValues);
variantRouter.put("/variant/:id", variantService.updateVariant);
variantRouter.delete("/variant/:id", variantService.deleteVariant);

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
 *   put:
 *     summary: Update a variant and its values
 *     tags: [Variant]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: The variant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variant_type:
 *                 type: string
 *                 description: The type of variant (e.g., "Size", "Color")
 *               product_id:
 *                 type: integer
 *                 description: The product ID associated with the variant
 *               status:
 *                 type: string
 *                 enum: ["Active", "Inactive"]
 *                 description: The status of the variant
 *               values:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of variant values (will replace existing values)
 *           example:
 *             variant_type: "Size"
 *             product_id: 3
 *             status: "Active"
 *             values: ["Small", "Medium", "Large", "XL"]
 *     responses:
 *       200:
 *         description: Variant updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Invalid input or missing required fields
 *       404:
 *         description: Variant not found
 *       500:
 *         description: Internal server error
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
