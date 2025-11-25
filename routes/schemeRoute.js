var express = require("express");
var router = express.Router();
const schemeService = require("../services/schemeService");

// CRUD
router.post("/schemes", schemeService.createScheme);
router.post("/schemes/code", schemeService.generateSchemeCode);
router.get("/schemes", schemeService.listSchemes);
router.get("/schemes/:id", schemeService.getSchemeById);
router.put("/schemes/:id", schemeService.updateScheme);
router.delete("/schemes/:id", schemeService.deleteScheme);

// Dropdowns
router.get("/dropdown/schemes", schemeService.listSchemeNumbers);
router.get("/dropdown/scheme-types", schemeService.listSchemeTypes);
router.get("/dropdown/scheme-durations", schemeService.listSchemeDurations);
router.get("/dropdown/payment-frequencies", schemeService.listPaymentFrequencies);
router.get("/dropdown/redemption-types", schemeService.listRedemptionTypes);
router.get("/dropdown/identity-proofs", schemeService.listIdentityProofs);
router.get("/dropdown/nominee-relations", schemeService.listNomineeRelations);
router.get("/dropdown/installments", schemeService.listInstallmentAmounts);

module.exports = router;


/**
 * @openapi
 * /api/v1/dropdown/installments:
 *   get:
 *     summary: Dropdown - Installment amounts for a scheme
 *     tags: [Scheme]
 *     parameters:
 *       - in: query
 *         name: scheme_id
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/dropdown/scheme-types:
 *   get:
 *     summary: Dropdown - Scheme Types
 *     tags: [Scheme]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/dropdown/scheme-durations:
 *   get:
 *     summary: Dropdown - Scheme Durations
 *     tags: [Scheme]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/dropdown/payment-frequencies:
 *   get:
 *     summary: Dropdown - Payment Frequencies
 *     tags: [Scheme]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/dropdown/redemption-types:
 *   get:
 *     summary: Dropdown - Redemption Types
 *     tags: [Scheme]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/dropdown/identity-proofs:
 *   get:
 *     summary: Dropdown - Identity Proofs
 *     tags: [Scheme]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/dropdown/nominee-relations:
 *   get:
 *     summary: Dropdown - Nominee Relations
 *     tags: [Scheme]
 *     responses:
 *       200:
 *         description: OK
 */


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
 *         name: scheme_type_id
 *         schema: { type: integer }
 *       - in: query
 *         name: duration_id
 *         schema: { type: integer }
 *       - in: query
 *         name: payment_frequency_id
 *         schema: { type: integer }
 *       - in: query
 *         name: redemption_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["Active", "Inactive"] }
 *     responses:
 *       200:
 *         description: OK. Returns IDs and names (material_type, scheme_type_name, duration_name, frequency_name, redemption_type_name)
 *   post:
 *     summary: Create scheme
 *     tags: [Scheme]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [material_type_id, scheme_name, scheme_type_id, duration_id, payment_frequency_id, redemption_id]
 *             properties:
 *               material_type_id: { type: integer }
 *               scheme_name: { type: string }
 *               scheme_type_id: { type: integer }
 *               duration_id: { type: integer }
 *               monthly_installments: { type: array, items: { type: number, format: float } }
 *               payment_frequency_id: { type: integer }
 *               min_amount: { type: number, format: float }
 *               redemption_id: { type: integer }
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
 *               scheme_type_id: { type: integer }
 *               duration_id: { type: integer }
 *               monthly_installments: { type: array, items: { type: number, format: float } }
 *               payment_frequency_id: { type: integer }
 *               min_amount: { type: number, format: float }
 *               redemption_id: { type: integer }
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
