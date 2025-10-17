var express = require("express");
var router = express.Router();
const svc = require("../services/grnService");

router.get("/grns/dropdown", svc.listGrnNumbers);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: GRN
 *     description: Goods Receipt Note
 */
/**
 * @openapi
 * /api/v1/grns/dropdown:
 *   get:
 *     summary: List GRN numbers for dropdown
 *     tags: [GRN]
 *     parameters:
 *       - in: query
 *         name: vendor_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 */
