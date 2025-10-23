var express = require("express");
var uomRouter = express.Router();
const uomService = require("../services/uomService");

uomRouter.post("/uoms", uomService.create);
uomRouter.get("/uoms", uomService.list);
uomRouter.get("/uoms/active", uomService.getActiveUoms);
uomRouter.get("/uoms/:id", uomService.getById);
uomRouter.get("/uoms/code/:code", uomService.getByCode);
uomRouter.put("/uoms/:id", uomService.update);
uomRouter.patch("/uoms/:id/status", uomService.toggleStatus);
uomRouter.delete("/uoms/:id", uomService.remove);

module.exports = uomRouter;

/**
 * @openapi
 * tags:
 *   - name: UOM
 *     description: Unit of Measure management
 */
/**
 * @openapi
 * /api/v1/uoms:
 *   get:
 *     summary: List UOMs
 *     tags: [UOM]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by UOM code, name, or short code
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive] }
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uoms:
 *                   type: array
 *                   items:
 *                     type: object
 *   post:
 *     summary: Create UOM
 *     tags: [UOM]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               uom_code: { type: string }
 *               uom_name: { type: string }
 *               short_code: { type: string }
 *               status: { type: string, enum: [Active, Inactive], default: Active }
 *             required: [uom_code, uom_name, short_code]
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request - UOM code or name/short_code combination already exists
 */
/**
 * @openapi
 * /api/v1/uoms/active:
 *   get:
 *     summary: Get all active UOMs
 *     tags: [UOM]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uoms:
 *                   type: array
 *                   items:
 *                     type: object
 */
/**
 * @openapi
 * /api/v1/uoms/{id}:
 *   get:
 *     summary: Get UOM by ID
 *     tags: [UOM]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 *   put:
 *     summary: Update UOM
 *     tags: [UOM]
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
 *               uom_code: { type: string }
 *               uom_name: { type: string }
 *               short_code: { type: string }
 *               status: { type: string, enum: [Active, Inactive] }
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Bad Request
 *       404:
 *         description: Not Found
 *   delete:
 *     summary: Delete UOM (soft)
 *     tags: [UOM]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 *       404:
 *         description: Not Found
 */
/**
 * @openapi
 * /api/v1/uoms/code/{code}:
 *   get:
 *     summary: Get UOM by code
 *     tags: [UOM]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *         description: UOM code to search for
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uom:
 *                   type: object
 *       404:
 *         description: UOM not found with this code
 */
/**
 * @openapi
 * /api/v1/uoms/{id}/status:
 *   patch:
 *     summary: Toggle UOM status
 *     tags: [UOM]
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
 *               status: { type: string, enum: [Active, Inactive] }
 *             required: [status]
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 */
