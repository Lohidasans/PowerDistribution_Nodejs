const express = require("express");
const router = express.Router();
const svc = require("../services/stockTransferService");

// Routes
router.post("/stock-transfers", svc.createStockTransfer);
router.post("/stock-transfers/code", svc.generateStockCode);
router.get("/stock-transfers", svc.listStockTransfers);
router.get("/stock-transfers/search", svc.searchProductBySku);
router.get("/stock-transfers/:id", svc.getStockTransferById);
router.put("/stock-transfers/:id", svc.updateStockTransfer);
router.put("/stock-transfers/:id/status", svc.updateStockTransferStatus);

router.delete("/stock-transfers/:id", svc.deleteStockTransfer);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Stock Transfer
 *     description: Stock Transfer Management
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     StockTransferItem:
 *       type: object
 *       required:
 *         - material_type_id
 *         - quantity
 *         - weight
 *         - amount
 *       properties:
 *         id:
 *           type: integer
 *           description: Stock Transfer Item ID (for updates)
 *         sku_id:
 *           type: string
 *         hsn_code:
 *           type: string
 *         material_type_id:
 *           type: integer
 *         category_id:
 *           type: integer
 *         subcategory_id:
 *           type: integer
 *         product_description:
 *           type: string
 *         quantity:
 *           type: integer
 *         weight:
 *           type: number
 *           format: float
 *         amount:
 *           type: number
 *           format: float
 * 
 *     StockTransfer:
 *       type: object
 *       required:
 *         - transfer_no
 *         - date
 *         - branch_from
 *         - branch_to
 *         - staff_name_id
 *         - reference_no
 *         - transport_id
 *         - items
 *       properties:
 *         transfer_no:
 *           type: string
 *         date:
 *           type: string
 *           format: date
 *         branch_from:
 *           type: integer
 *         branch_to:
 *           type: integer
 *         staff_name_id:
 *           type: integer
 *         reference_no:
 *           type: string
 *         transport_id:
 *           type: string
 *         remarks:
 *           type: string
 *         grand_total:
 *           type: number
 *           format: float
 *         total_product:
 *           type: integer
 *         total_weight:
 *           type: number
 *           format: float
 *         total_quantity:
 *           type: integer
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StockTransferItem'
 */

/**
 * @openapi
 * /api/v1/stock-transfers:
 *   post:
 *     summary: Create a new stock transfer
 *     tags: [Stock Transfer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StockTransfer'
 *     responses:
 *       201:
 *         description: Stock transfer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StockTransfer'
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Server error
 *
 *   get:
 *     summary: List all stock transfers with pagination
 *     tags: [Stock Transfer]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term (transfer_no or reference_no)
 *     responses:
 *       200:
 *         description: List of stock transfers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StockTransfer'
 *
 * /api/v1/stock-transfers/{id}:
 *   get:
 *     summary: Get a stock transfer by ID
 *     tags: [Stock Transfer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock Transfer ID
 *     responses:
 *       200:
 *         description: Stock transfer details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StockTransfer'
 *       404:
 *         description: Stock transfer not found
 *
 *   put:
 *     summary: Update a stock transfer
 *     tags: [Stock Transfer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock Transfer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StockTransfer'
 *     responses:
 *       200:
 *         description: Stock transfer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StockTransfer'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Stock transfer not found
 *
 *   delete:
 *     summary: Delete a stock transfer (soft delete)
 *     tags: [Stock Transfer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Stock Transfer ID
 *     responses:
 *       204:
 *         description: Stock transfer deleted successfully
 *       404:
 *         description: Stock transfer not found
 */
