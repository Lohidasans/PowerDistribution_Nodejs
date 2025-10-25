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
 *     summary: Create vendor with optional bank account, KYC docs, and login
 *     tags: [Vendor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vendor_image_url: { type: string }
 *               vendor_code: { type: string }
 *               vendor_name: { type: string }
 *               proprietor_name: { type: string }
 *               email: { type: string }
 *               mobile: { type: string }
 *               pan_no: { type: string }
 *               gst_no: { type: string }
 *               address: { type: string }
 *               country: { type: string }
 *               state: { type: string }
 *               district: { type: string }
 *               pin_code: { type: string }
 *               opening_balance: { type: number }
 *               opening_balance_type: { type: string, enum: ["Dr", "Cr"] }
 *               payment_terms: { type: string }
 *               material_type_ids: { type: array, items: { type: integer } }
 *               visibilities: { type: array, items: { type: integer } }
 *               status: { type: string, enum: [Active, Inactive] }
 *               bank_account:
 *                 type: object
 *                 properties:
 *                   account_holder_name: { type: string }
 *                   bank_name: { type: string }
 *                   ifsc_code: { type: string }
 *                   account_number: { type: string }
 *                   bank_branch_name: { type: string }
 *               kyc_documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     doc_type: { type: string }
 *                     doc_number: { type: string }
 *                     file_url: { type: string }
 *               login:
 *                 type: object
 *                 properties:
 *                   email: { type: string }
 *                   password_hash: { type: string }
 *                   role_id: { type: integer }
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
 *     summary: Update vendor with optional upserts for bank account, KYC docs, and login
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
 *             type: object
 *             properties:
 *               vendor_image_url: { type: string }
 *               vendor_code: { type: string }
 *               vendor_name: { type: string }
 *               proprietor_name: { type: string }
 *               email: { type: string }
 *               mobile: { type: string }
 *               pan_no: { type: string }
 *               gst_no: { type: string }
 *               address: { type: string }
 *               country: { type: string }
 *               state: { type: string }
 *               district: { type: string }
 *               pin_code: { type: string }
 *               opening_balance: { type: number }
 *               opening_balance_type: { type: string, enum: ["Dr", "Cr"] }
 *               payment_terms: { type: string }
 *               material_type_ids: { type: array, items: { type: integer } }
 *               visibilities: { type: array, items: { type: integer } }
 *               status: { type: string, enum: [Active, Inactive] }
 *               bank_account:
 *                 type: object
 *                 properties:
 *                   account_holder_name: { type: string }
 *                   bank_name: { type: string }
 *                   ifsc_code: { type: string }
 *                   account_number: { type: string }
 *                   bank_branch_name: { type: string }
 *               kyc_documents:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     doc_type: { type: string }
 *                     doc_number: { type: string }
 *                     file_url: { type: string }
 *               kyc_delete_ids:
 *                 type: array
 *                 items: { type: integer }
 *               login:
 *                 type: object
 *                 properties:
 *                   email: { type: string }
 *                   password_hash: { type: string }
 *                   role_id: { type: integer }
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

