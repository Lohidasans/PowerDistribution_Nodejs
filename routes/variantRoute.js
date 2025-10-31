var express = require("express");
var variantRouter = express.Router();
const variantService = require("../services/variantService");

variantRouter.post("/variant", variantService.createVariant);
variantRouter.get("/variants", variantService.listVariantWithValues);
variantRouter.get("/variants/detailed", variantService.listVariantsDetailed);
variantRouter.get("/variant/:id", variantService.getByIdVariant);
variantRouter.put("/variant/:id", variantService.updateVariant);
variantRouter.delete("/variant/:id", variantService.deleteVariant);

module.exports = variantRouter;

/**
 * @openapi
 * /api/v1/variants/detailed:
 *   get:
 *     summary: List variants with their values as an array of objects
 *     tags: [Variant]
 *     parameters:
 *       - in: query
 *         name: variant_type
 *         schema: { type: string }
 *         required: false
 *         description: Filter by variant type (ILIKE)
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     variants:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           Variant Type: { type: string }
 *                           Values:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: integer }
 *                                 value: { type: string }
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
 *         schema: { type: integer }
 *         description: The variant ID
 *     responses:
 *       200:
 *         description: Variant retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Success"
 *                 data:
 *                   type: object
 *                   properties:
 *                     variant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         variant_type:
 *                           type: string
 *                           example: "Size"
 *                         status:
 *                           type: string
 *                           example: "Active"
 *                         variant_values:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               value:
 *                                 type: string
 *                                 example: "Small"
 *                               sort_order:
 *                                 type: integer
 *                                 example: 1
 *                               status:
 *                                 type: string
 *                                 example: "Active"
 *       404:
 *         description: Variant not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'

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
