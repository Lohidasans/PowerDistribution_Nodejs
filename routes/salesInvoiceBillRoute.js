var express = require("express");
var router = express.Router();
const svc = require("../services/salesInvoiceBillService");

router.post("/sales-invoice-bills/code", svc.generateSalesInvoiceNo);
router.post("/sales-invoice-bills", svc.createSalesInvoice);
router.put("/sales-invoice-bills/:id", svc.updateSalesInvoice);
router.get("/sales-invoice-bills", svc.listSalesInvoices);
router.get("/sales-invoice-bills/search", svc.searchInvoices);
router.get("/sales-invoice-bills/:id", svc.getSalesInvoiceById);
router.delete("/sales-invoice-bills/:id", svc.deleteSalesInvoice);

module.exports = router;

/**
 * @openapi
 * /api/v1/sales-invoice-bills/code:
 *   post:
 *     summary: Generate a new Invoice number
 *     tags: [SalesInvoiceBill]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema: { type: string, default: INV }
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
 * /api/v1/sales-invoice-bills:
 *   post:
 *     summary: Create an invoice bill (header + items)
 *     tags: [SalesInvoiceBill]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SalesInvoiceBillCreateRequest'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SalesInvoiceBillResponse'
 *   get:
 *     summary: List invoice bills
 *     tags: [SalesInvoiceBill]
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
 * /api/v1/sales-invoice-bills/{id}:
 *   get:
 *     summary: Get an invoice bill by ID
 *     tags: [SalesInvoiceBill]
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete an invoice bill (soft)
 *     tags: [SalesInvoiceBill]
 *     responses:
 *       204:
 *         description: No Content
 */
