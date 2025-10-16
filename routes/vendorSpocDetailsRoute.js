var express = require("express");
var router = express.Router();
const vendorContactService = require("../services/vendorSpocDetailsService");

// CRUD
router.post("/vendor-SpocDetails", vendorContactService.createVendorContact);
router.get("/vendor-SpocDetails", vendorContactService.listVendorContacts);
router.get(
  "/vendor-SpocDetails/:id",
  vendorContactService.getVendorContactById
);
router.delete(
  "/vendor-SpocDetails/:id",
  vendorContactService.deleteVendorContact
);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: VendorSpocDetails
 *     description: Vendor Contact management
 */

/**
 * @openapi
 * /api/v1/vendor-SpocDetails:
 *   get:
 *     summary: List VendorSpocDetails
 *     tags: [VendorSpocDetails]
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create VendorSpocDetails
 *     tags: [VendorSpocDetails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vendor_id]
 *             properties:
 *               vendor_id:
 *                 type: integer
 *               contact_name:
 *                 type: string
 *               designation:
 *                 type: string
 *               mobile:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/vendor-SpocDetails/{id}:
 *   get:
 *     summary: Get vendor contact by ID
 *     tags: [VendorSpocDetails]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete vendor contact (soft)
 *     tags: [VendorSpocDetails]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
