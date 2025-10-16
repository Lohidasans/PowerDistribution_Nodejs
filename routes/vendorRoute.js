var express = require("express");
var vendorRouter = express.Router();
const vendorService = require("../services/vendorService");

// CRUD
vendorRouter.post("/vendors", vendorService.createVendor);
vendorRouter.get("/vendors", vendorService.listVendors);
vendorRouter.get("/vendors/:id", vendorService.getVendorById);
vendorRouter.put("/vendors/:id", vendorService.updateVendor);
vendorRouter.delete("/vendors/:id", vendorService.deleteVendor);

module.exports = vendorRouter;

/**
 * @openapi
 * tags:
 *   - name: Vendor
 *     description: Vendor management
 */

/**
 * @openapi
 * /api/v1/vendors:
 *   get:
 *     summary: List vendors
 *     tags: [Vendor]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create vendor
 *     tags: [Vendor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Vendor'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/vendors/{id}:
 *   get:
 *     summary: Get vendor by ID
 *     tags: [Vendor]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update vendor
 *     tags: [Vendor]
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
 *             $ref: '#/components/schemas/Vendor'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete vendor (soft)
 *     tags: [Vendor]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
