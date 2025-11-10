const express = require("express");
const router = express.Router();
const svc = require("../services/quotationRequestService");

// Routes
router.post("/quotation-requests", svc.createQuotationRequest);
router.get("/quotation-requests", svc.getAllQuotationRequests);
router.get("/quotation-requests/:id", svc.getQuotationRequestById);
router.put("/quotation-requests/:id", svc.updateQuotationRequest);
router.delete("/quotation-requests/:id", svc.deleteQuotationRequest);
router.post("/quotation-requests/code", svc.generateQuotationRequestCode);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Quotation Request
 *     description: Quotation Request Management
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     QuotationItem:
 *       type: object
 *       required:
 *         - material_type_id
 *         - category_id
 *         - subcategory_id
 *         - quantity
 *       properties:
 *         id:
 *           type: integer
 *           description: Quotation Item ID (for updates)
 *         material_type_id:
 *           type: integer
 *         category_id:
 *           type: integer
 *         subcategory_id:
 *           type: integer
 *         product_description:
 *           type: string
 *         purity:
 *           type: number
 *           format: float
 *         weight:
 *           type: number
 *           format: float
 *         quantity:
 *           type: integer
 *
 *     QuotationRequest:
 *       type: object
 *       required:
 *         - qr_id
 *         - request_date
 *         - expiry_date
 *         - vendor_ids
 *         - items
 *       properties:
 *         qr_id:
 *           type: string
 *         request_date:
 *           type: string
 *           format: date
 *         expiry_date:
 *           type: string
 *           format: date
 *         vendor_ids:
 *           type: array
 *           items:
 *             type: integer
 *         status_id:
 *           type: integer
 *           default: 1
 *         remarks:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QuotationItem'
 */

/**
 * @openapi
 * /api/v1/quotation-requests:
 *   post:
 *     summary: Create a new Quotation Request
 *     tags: [Quotation Request]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuotationRequest'
 *     responses:
 *       201:
 *         description: Quotation Request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/quotation-requests/{id}:
 *   get:
 *     summary: Get a Quotation Request by ID
 *     tags: [Quotation Request]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Quotation Request details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/quotation-requests/{id}:
 *   put:
 *     summary: Update a Quotation Request
 *     tags: [Quotation Request]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuotationRequest'
 *     responses:
 *       200:
 *         description: Quotation Request updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/quotation-requests/{id}:
 *   delete:
 *     summary: Delete a Quotation Request (soft delete)
 *     tags: [Quotation Request]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Quotation Request deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/quotation-requests:
 *   get:
 *     summary: List all Quotation Requests with pagination
 *     tags: [Quotation Request]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of Quotation Requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
