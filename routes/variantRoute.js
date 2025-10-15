
var express = require("express");
var variantRouter = express.Router();
const variantService = require("../services/variantService");

variantRouter.post("/variant", variantService.createVariant);

module.exports = variantRouter;

/**
 * @openapi
 * tags:
 *   - name: Variant
 *     description: Variant management
 */

/**
 * @openapi
 * /api/v1/variant:
 *   post:
 *     summary: Create variant
 *     tags: [Variant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Variant'
 *     responses:
 *       201:
 *         description: Created
 */
