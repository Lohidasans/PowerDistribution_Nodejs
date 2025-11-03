var express = require("express");
var router = express.Router();
const svc = require("../services/estimateBillService");

router.post("/estimate-bills/code", svc.generateEstimateNo);
router.post("/estimate-bills", svc.createEstimate);
router.get("/estimate-bills", svc.listEstimates);
router.get("/estimate-bills/:id", svc.getEstimateById);
router.delete("/estimate-bills/:id", svc.deleteEstimate);

module.exports = router;

/**
 * @openapi
 * /api/v1/estimate-bills/code:
 *   post:
 *     summary: Generate a new Estimate number
 *     tags: [EstimateBill]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema: { type: string, default: EST }
 *       - in: query
 *         name: fy
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 */
/**
 * @openapi
 * /api/v1/estimate-bills:
 *   post:
 *     summary: Create an estimate bill (header + items)
 *     tags: [EstimateBill]
 *     responses:
 *       201:
 *         description: Created
 *   get:
 *     summary: List estimate bills
 *     tags: [EstimateBill]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: employee_id
 *         schema: { type: integer }
 *       - in: query
 *         name: customer_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 */
/**
 * @openapi
 * /api/v1/estimate-bills/{id}:
 *   get:
 *     summary: Get an estimate bill by ID
 *     tags: [EstimateBill]
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete an estimate bill (soft)
 *     tags: [EstimateBill]
 *     responses:
 *       204:
 *         description: No Content
 */
