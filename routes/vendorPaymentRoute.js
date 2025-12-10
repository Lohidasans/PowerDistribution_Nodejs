var express = require("express");
var router = express.Router();
const svc = require("../services/vendorPaymentService");

// CRUD
router.post("/vendor-payments", svc.createVendorPayment);
router.post("/vendor-payments/code", svc.generatePaymentNumber);
router.get("/vendor-payments", svc.getVendorPayments);
router.get("/vendor-payments/:id", svc.getVendorPaymentById);
router.put("/vendor-payments/:id", svc.updateVendorPayment); 
router.delete("/vendor-payments/:id", svc.deleteVendorPayment);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Vendor Payment
 *     description: Vendor Payment management
 */

/**
 * @openapi
 * /api/v1/vendor-payment:
 *   get:
 *     summary: List all vendor payments
 *     tags: [Vendor Payment]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *         description: Items per page
 *       - in: query
 *         name: bill_type
 *         schema: { type: string, enum: [Invoice, Salary, Expense, Other] }
 *         description: Filter by bill type
 *       - in: query
 *         name: payment_mode
 *         schema: { type: string, enum: [Cash, Card, Bank Transfer, Cheque, UPI, Other] }
 *         description: Filter by payment mode
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *         description: Filter by start date (YYYY-MM-DD)
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *         description: Filter by end date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create a new vendor payment
 *     tags: [Vendor Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payment_date
 *               - bill_type
 *               - payment_mode
 *               - account_name_id
 *               - amount
 *               - amount_in_words
 *             properties:
 *               payment_date: { type: string, format: date, example: "2025-12-09" }
 *               bill_type: { type: string, enum: [Invoice, Salary, Expense, Other] }
 *               payment_mode: { type: string, enum: [Cash, Card, Bank Transfer, Cheque, UPI, Other] }
 *               account_name_id: { type: string, description: "Vendor bank account ID" }
 *               amount: { type: number, format: decimal }
 *               amount_in_words: { type: string }
 *               invoice_id: { type: string, description: "Reference to invoice if bill_type is Invoice" }
 *               purchase_id: { type: string, description: "Reference to purchase order if applicable" }
 *               ref_id: { type: string, description: "Reference ID for other payment types" }
 *               remarks: { type: string }
 *     responses:
 *       201:
 *         description: Vendor payment created successfully
 */

/**
 * @openapi
 * /api/v1/vendor-payment/{id}:
 *   get:
 *     summary: Get vendor payment by ID
 *     tags: [Vendor Payment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update vendor payment by ID
 *     tags: [Vendor Payment]
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
 *             $ref: '#/components/schemas/VendorPayment'
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Delete vendor payment (soft delete)
 *     tags: [Vendor Payment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
