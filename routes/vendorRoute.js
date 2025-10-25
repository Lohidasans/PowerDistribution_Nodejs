var express = require("express");
var vendorRouter = express.Router();
const vendorService = require("../services/vendorService");

// CRUD
vendorRouter.post("/vendors", vendorService.createVendor);
vendorRouter.get("/vendors", vendorService.listVendors);
vendorRouter.get("/vendors/dropdown", vendorService.listVendorDropdown);
vendorRouter.get("/vendors/:id", vendorService.getVendorById);
vendorRouter.put("/vendors/:id", vendorService.updateVendor);
vendorRouter.delete("/vendors/:id", vendorService.deleteVendor);
vendorRouter.post("/vendors/code", vendorService.generateVendorCode);

module.exports = vendorRouter;

/**
 * @openapi
 * /api/v1/vendors/code:
 *   post:
 *     summary: Generate next vendor code
 *     tags: [Vendor]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: integer }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vendor_code: { type: string, example: "VEN 01/24-25" }
 */
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
 *     summary: Create vendor with optional bank account, KYC docs, SPOC details, and login (create-only for related entities)
 *     tags: [Vendor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VendorFullCreateInput'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/vendors/dropdown:
 *   get:
 *     summary: List vendors for dropdown (id and vendor_name only)
 *     tags: [Vendor]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vendors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       vendor_name:
 *                         type: string
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
 *     summary: Update vendor with optional updates for bank account, KYC docs, SPOC details, and login (update-only; KYC/SPOC require id)
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
 *             $ref: '#/components/schemas/VendorFullUpdateInput'
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

