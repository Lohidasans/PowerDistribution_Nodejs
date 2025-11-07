const express = require("express");
const router = express.Router();
const svc = require("../services/purchaseReturnService");

// Routes
router.post("/purchase-returns", svc.createPurchaseReturn);
router.get("/purchase-returns", svc.getAllPurchaseReturns);
router.get("/purchase-returns/dropdown", svc.listPurchaseReturnNumbers);
router.get("/purchase-returns/:id", svc.getPurchaseReturnById);
router.get("/purchase-returns/:id/view", svc.getPurchaseReturnView);
router.put("/purchase-returns/:id", svc.updatePurchaseReturn);
router.delete("/purchase-returns/:id", svc.deletePurchaseReturn);
router.post("/purchase-returns/code", svc.generatePurchaseReturnCode);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: PurchaseReturn
 *     description: Purchase Return Management
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     PurchaseReturnItem:
 *       type: object
 *       required:
 *         - material_type_id
 *         - category_id
 *         - subcategory_id
 *       properties:
 *         id:
 *           type: integer
 *           description: Purchase Return Item ID (for updates)
 *         material_type_id:
 *           type: integer
 *         category_id:
 *           type: integer
 *         subcategory_id:
 *           type: integer
 *         description:
 *           type: string
 *         purity:
 *           type: number
 *           format: float
 *         weight:
 *           type: number
 *           format: float
 *         quantity:
 *           type: integer
 *         rate:
 *           type: number
 *           format: float
 *         amount:
 *           type: number
 *           format: float
 * 
 *     PurchaseReturn:
 *       type: object
 *       required:
 *         - pr_no
 *         - pr_date
 *         - vendor_id
 *         - items
 *       properties:
 *         pr_no:
 *           type: string
 *         pr_date:
 *           type: string
 *           format: date
 *         grn_id:
 *           type: integer
 *         vendor_id:
 *           type: integer
 *         order_by_user_id:
 *           type: integer
 *         reference_id:
 *           type: string
 *         gst_no:
 *           type: string
 *         billing_address:
 *           type: string
 *         shipping_address:
 *           type: string
 *         subtotal_amount:
 *           type: number
 *           format: float
 *         sgst_percent:
 *           type: number
 *           format: float
 *         cgst_percent:
 *           type: number
 *           format: float
 *         discount_percent:
 *           type: number
 *           format: float
 *         remarks:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PurchaseReturnItem'
 */

/**
 * @openapi
 * /api/v1/purchase-returns:
 *   post:
 *     summary: Create a new Purchase Return
 *     tags: [PurchaseReturn]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PurchaseReturn'
 *     responses:
 *       201:
 *         description: Purchase Return created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/purchase-returns/{id}:
 *   get:
 *     summary: Get a Purchase Return by ID
 *     tags: [PurchaseReturn]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Purchase Return details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/purchase-returns/{id}:
 *   put:
 *     summary: Update a Purchase Return
 *     tags: [PurchaseReturn]
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
 *             $ref: '#/components/schemas/PurchaseReturn'
 *     responses:
 *       200:
 *         description: Purchase Return updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/purchase-returns/{id}:
 *   delete:
 *     summary: Delete a Purchase Return (soft delete)
 *     tags: [PurchaseReturn]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Purchase Return deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/purchase-returns:
 *   get:
 *     summary: List all Purchase Returns with pagination and filters
 *     tags: [PurchaseReturn]
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
 *         name: branch_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of Purchase Returns
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/purchase-returns/dropdown:
 *   get:
 *     summary: Get Purchase Return numbers for dropdown
 *     tags: [PurchaseReturn]
 *     parameters:
 *       - in: query
 *         name: vendor_id
 *         schema: 
 *           type: integer
 *       - in: query
 *         name: search
 *         schema: 
 *           type: string
 *     responses:
 *       200:
 *         description: List of Purchase Return numbers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 purchase_returns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       pr_no:
 *                         type: string
 */

/**
 * @openapi
 * /api/v1/purchase-returns/code:
 *   post:
 *     summary: Generate next Purchase Return code
 *     tags: [PurchaseReturn]
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
 *                     pr_no: { type: string, example: "PR 01/24-25" }
 */

