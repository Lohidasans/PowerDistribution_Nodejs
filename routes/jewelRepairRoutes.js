const express = require('express');
const router = express.Router();
const svc = require('../services/jewelRepairService');

// Routes
router.post('/jewel-repairs', svc.createJewelRepair);
router.get('/jewel-repairs', svc.getAllJewelRepairs);
router.get('/jewel-repairs/:id', svc.getJewelRepairById);
router.put('/jewel-repairs/:id', svc.updateJewelRepair);
router.delete('/jewel-repairs/:id', svc.deleteJewelRepair);
router.post('/jewel-repairs/code', svc.generateRepairCode);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: JewelRepairs
 *   description: Jewel Repair Management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     JewelRepairItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         repair_id:
 *           type: integer
 *           readOnly: true
 *         description:
 *           type: string
 *           description: Description of the repair item
 *         product_id:
 *           type: integer
 *           description: ID of the related product (if any)
 *         product_item_detail_id:
 *           type: integer
 *           description: ID of the product item detail (if any)
 *         sku_id:
 *           type: string
 *           description: SKU ID of the item
 *         hsn_code:
 *           type: string
 *           description: HSN code for the item
 *         quantity:
 *           type: number
 *           format: float
 *           description: Quantity of the item
 *         amount:
 *           type: number
 *           format: float
 *           description: Total amount for this item
 *         remarks:
 *           type: string
 *           description: Any additional remarks
 * 
 *     JewelRepair:
 *       type: object
 *       required:
 *         - repair_code
 *         - customer_id
 *         - employee_id
 *         - date
 *         - status
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *         repair_code:
 *           type: string
 *           description: Unique code for the repair
 *         customer_id:
 *           type: integer
 *           description: ID of the customer
 *         employee_id:
 *           type: integer
 *           description: ID of the employee handling the repair
 *         branch_id:
 *           type: integer
 *           description: ID of the branch
 *         date:
 *           type: string
 *           format: date
 *           description: Date of the repair
 *         time:
 *           type: string
 *           description: Time of the repair
 *         status:
 *           type: string
 *           enum: [Pending, In Progress, Completed, Delivered, Cancelled]
 *           default: Pending
 *         sub_total_amount:
 *           type: number
 *           format: float
 *           description: Subtotal amount before discount
 *         discount_type:
 *           type: string
 *           enum: [Amount, Percentage]
 *           description: Type of discount
 *         discount_amount:
 *           type: number
 *           format: float
 *           description: Discount amount
 *         total_amount:
 *           type: number
 *           format: float
 *           description: Total amount after discount
 *         total_quantity:
 *           type: integer
 *           description: Total quantity of items
 *         amount_in_words:
 *           type: string
 *           description: Total amount in words
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/JewelRepairItem'
 */

/**
 * @swagger
 * /api/jewel-repairs:
 *   post:
 *     summary: Create a new jewel repair record
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JewelRepair'
 *     responses:
 *       201:
 *         description: Jewel repair created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JewelRepair'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs:
 *   get:
 *     summary: Get all jewel repairs with pagination and filters
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by repair code, customer name, or mobile
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, In Progress, Completed, Delivered, Cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: customer_id
 *         schema:
 *           type: integer
 *         description: Filter by customer ID
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: integer
 *         description: Filter by branch ID
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date (YYYY-MM-DD)
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of jewel repairs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/JewelRepair'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     pageSize:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs/{id}:
 *   get:
 *     summary: Get a single jewel repair by ID
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Jewel repair ID
 *     responses:
 *       200:
 *         description: Jewel repair details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JewelRepair'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Jewel repair not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs/{id}:
 *   put:
 *     summary: Update a jewel repair
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Jewel repair ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JewelRepair'
 *     responses:
 *       200:
 *         description: Jewel repair updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JewelRepair'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Jewel repair not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs/{id}/status:
 *   patch:
 *     summary: Update repair status
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Jewel repair ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Pending, In Progress, Completed, Delivered, Cancelled]
 *               delivered_by:
 *                 type: integer
 *                 description: Required when status is 'Delivered'
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status or missing required fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Jewel repair not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs/{id}:
 *   delete:
 *     summary: Delete a jewel repair (soft delete)
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Jewel repair ID
 *     responses:
 *       204:
 *         description: Jewel repair deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Jewel repair not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs/code:
 *   get:
 *     summary: Generate a new repair code
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: prefix
 *         schema:
 *           type: string
 *         description: Prefix for the repair code (default REP)
 *     responses:
 *       200:
 *         description: Generated repair code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repair_code:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/jewel-repairs/status/counts:
 *   get:
 *     summary: Get counts of repairs by status
 *     tags: [JewelRepairs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema:
 *           type: integer
 *         description: Filter by branch ID
 *     responses:
 *       200:
 *         description: Repair status counts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   status:
 *                     type: string
 *                   count:
 *                     type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
