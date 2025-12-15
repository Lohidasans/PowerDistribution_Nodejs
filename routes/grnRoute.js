const express = require("express");
const router = express.Router();
const svc = require("../services/grnService");

// Routes
router.post("/grns",  svc.createGrn);
router.get("/grns", svc.getAllGrns);
router.get("/grns/refno", svc.getAllGrnInfos);
router.get("/grns/dropdown", svc.listGrnNumbers);
router.get("/grns/:id", svc.getGrnById);
router.get("/grns/:id/view", svc.getGrnView);
router.put("/grns/:id", svc.updateGrn);
router.put("/grns/:grn_id/status", svc.updateGrnStatus);
router.delete("/grns/:id", svc.deleteGrn);
router.post("/grns/code", svc.generateGrnCode);


module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: GRN
 *     description: Goods Receipt Note Management
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     GRNItem:
 *       type: object
 *       required:
 *         - material_type_id
 *         - category_id
 *         - subcategory_id
 *       properties:
 *         id:
 *           type: integer
 *           description: GRN Item ID (for updates)
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
 *         ordered_weight:
 *           type: number
 *           format: float
 *         received_weight:
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
 *     GRN:
 *       type: object
 *       required:
 *         - grn_no
 *         - grn_date
 *         - vendor_id
 *         - items
 *       properties:
 *         grn_no:
 *           type: string
 *         grn_date:
 *           type: string
 *           format: date
 *         po_id:
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
 *             $ref: '#/components/schemas/GRNItem'
 */

/**
 * @openapi
 * /api/v1/grns:
 *   post:
 *     summary: Create a new GRN (Goods Receipt Note)
 *     tags: [GRN]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GRN'
 *     responses:
 *       201:
 *         description: GRN created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/grns/{id}:
 *   get:
 *     summary: Get a GRN by ID
 *     tags: [GRN]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: GRN details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/grns/{id}:
 *   put:
 *     summary: Update a GRN
 *     tags: [GRN]
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
 *             $ref: '#/components/schemas/GRN'
 *     responses:
 *       200:
 *         description: GRN updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/grns/{id}:
 *   delete:
 *     summary: Delete a GRN (soft delete)
 *     tags: [GRN]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: GRN deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/grns:
 *   get:
 *     summary: List all GRNs with pagination and filters
 *     tags: [GRN]
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
 *         description: List of GRNs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */

/**
 * @openapi
 * /api/v1/grns/dropdown:
 *   get:
 *     summary: Get GRN numbers for dropdown
 *     tags: [GRN]
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
 *         description: List of GRN numbers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 grns:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       grn_no:
 *                         type: string
 */

/**
 * @openapi
 * /api/v1/grns/code:
 *   post:
 *     summary: Generate next GRN code
 *     tags: [GRN]
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
 *                     grn_no: { type: string, example: "GRN 01/24-25" }
 */

/**
 * @openapi
 * /api/v1/grns/{grn_id}/status:
 *   put:
 *     summary: Activate or Deactivate a GRN
 *     tags: [GRN]
 *     parameters:
 *       - in: path
 *         name: grn_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: GRN status updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: GRN not found
 */
