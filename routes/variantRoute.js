var express = require("express");
var variantRouter = express.Router();
const variantService = require("../services/variantService");

/* ===================== ROUTES ===================== */

variantRouter.post("/variant", variantService.createVariant);
variantRouter.get("/variants", variantService.listVariantWithValues);
variantRouter.get("/variants/detailed", variantService.listVariantsDetailed);
variantRouter.get("/variant/:id", variantService.getByIdVariant);
variantRouter.put("/variant/:id", variantService.updateVariant);
variantRouter.delete("/variant/:id", variantService.deleteVariant);

module.exports = variantRouter;

/* ===================== SWAGGER ===================== */

/**
 * @openapi
 * /api/v1/variants/detailed:
 *   get:
 *     summary: List variants with their values as an array of objects
 *     tags: [Variant]
 *     parameters:
 *       - in: query
 *         name: variant_type
 *         schema:
 *           type: string
 *         required: false
 *         description: Filter by variant type (ILIKE)
 *     responses:
 *       200:
 *         description: OK
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
 * /api/v1/variant/{id}:
 *   get:
 *     summary: Get a variant by ID with its values
 *     tags: [Variant]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Variant retrieved successfully
 *       404:
 *         description: Variant not found
 *       500:
 *         description: Internal server error
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
 *           example:
 *             variant_type: "Size"
 *             values: ["Small", "Medium", "Large"]
 *     responses:
 *       201:
 *         description: Variant created successfully
 *       400:
 *         description: Invalid input
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
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             variant_type: "Size"
 *             status: "Active"
 *             values: ["Small", "Medium", "Large", "XL"]
 *     responses:
 *       200:
 *         description: Variant updated successfully
 *       404:
 *         description: Variant not found
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
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Variant deleted successfully
 */
