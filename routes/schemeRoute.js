var express = require("express");
var router = express.Router();
const schemeService = require("../services/schemeService");

// CRUD
router.post("/schemes", schemeService.createScheme);
router.get("/schemes", schemeService.listSchemes);
router.get("/schemes/:id", schemeService.getSchemeById);
router.put("/schemes/:id", schemeService.updateScheme);
router.delete("/schemes/:id", schemeService.deleteScheme);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Scheme
 *     description: Scheme master management
 */

/**
 * @openapi
 * /api/v1/schemes:
 *   get:
 *     summary: List schemes
 *     tags: [Scheme]
 *     parameters:
 *       - in: query
 *         name: material_type_id
 *         schema: { type: integer }
 *       - in: query
 *         name: scheme_type
 *         schema: { type: string, enum: ["Weight Based", "Value Based"] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["Active", "Inactive"] }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create scheme
 *     tags: [Scheme]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [material_type_id, scheme_name, scheme_type, duration, payment_frequency, redemption]
 *             properties:
 *               material_type_id: { type: integer }
 *               scheme_name: { type: string }
 *               scheme_type: { type: string, enum: ["Weight Based", "Value Based"] }
 *               duration: { type: string, enum: ["6 Months", "12 Months"] }
 *               monthly_installments: { type: array, items: { type: number, format: float } }
 *               payment_frequency: { type: string, enum: ["Monthly", "Quarterly", "Half Yearly", "Yearly"] }
 *               min_amount: { type: number, format: float }
 *               redemption: { type: string, enum: ["Jewellery", "Coins", "Bars"] }
 *               visible_to: { type: array, items: { type: integer } }
 *               status: { type: string, enum: ["Active", "Inactive"] }
 *               terms_and_conditions_url: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/schemes/{id}:
 *   get:
 *     summary: Get scheme by ID
 *     tags: [Scheme]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update scheme
 *     tags: [Scheme]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               material_type_id: { type: integer }
 *               scheme_name: { type: string }
 *               scheme_type: { type: string, enum: ["Weight Based", "Value Based"] }
 *               duration: { type: string, enum: ["6 Months", "12 Months"] }
 *               monthly_installments: { type: array, items: { type: number, format: float } }
 *               payment_frequency: { type: string, enum: ["Monthly", "Quarterly", "Half Yearly", "Yearly"] }
 *               min_amount: { type: number, format: float }
 *               redemption: { type: string, enum: ["Jewellery", "Coins", "Bars"] }
 *               visible_to: { type: array, items: { type: integer } }
 *               status: { type: string, enum: ["Active", "Inactive"] }
 *               terms_and_conditions_url: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete scheme (soft)
 *     tags: [Scheme]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
