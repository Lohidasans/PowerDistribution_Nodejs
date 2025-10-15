var express = require("express");
var variantValueRouter = express.Router();
const variantValueService = require("../services/variantValueService");

// Create multiple variant values
variantValueRouter.post("/variant-value", variantValueService.createVariantValues);

module.exports = variantValueRouter;

/**
 * @openapi
 * tags:
 *   - name: VariantValue
 *     description: Variant Value management
 */

/**
 * @openapi
 * /api/v1/variant-value:
 *   post:
 *     summary: Create one or more variant values
 *     tags: [VariantValue]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [variant_id, values]
 *             properties:
 *               variant_id:
 *                 type: integer
 *                 example: 1
 *               values:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Red", "Blue", "Green"]
 *     responses:
 *       201:
 *         description: Variant values created successfully
 */
