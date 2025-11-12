const express = require("express");
const router = express.Router();
const svc = require("../services/billAdjustmentTypeService");

router.post("/bill-adjustments", svc.createBillAdjustmentType);
router.get("/bill-adjustments", svc.getAllBillAdjustmentTypes);
router.get("/bill-adjustments/:id", svc.getBillAdjustmentTypeById);
router.put("/bill-adjustments/:id", svc.updateBillAdjustmentType);
router.delete("/bill-adjustments/:id", svc.deleteBillAdjustmentType);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Bill Adjustment Types
 *   description: Bill adjustment type management
 */

/**
 * @swagger
 * /api/bill-adjustment-types:
 *   post:
 *     summary: Create a new bill adjustment type
 *     tags: [Bill Adjustment Types]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type_name
 *             properties:
 *               type_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *     responses:
 *       201:
 *         description: Bill adjustment type created successfully
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Bill adjustment type with this name already exists
 */


/**
 * @swagger
 * /api/bill-adjustment-types:
 *   get:
 *     summary: Get all bill adjustment types (for dropdown)
 *     tags: [Bill Adjustment Types]
 *     responses:
 *       200:
 *         description: List of bill adjustment types
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   type_name:
 *                     type: string
 */


/**
 * @swagger
 * /api/bill-adjustment-types/{id}:
 *   get:
 *     summary: Get a bill adjustment type by ID
 *     tags: [Bill Adjustment Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Bill adjustment type details
 *       404:
 *         description: Bill adjustment type not found
 */


/**
 * @swagger
 * /api/bill-adjustment-types/{id}:
 *   put:
 *     summary: Update a bill adjustment type
 *     tags: [Bill Adjustment Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *     responses:
 *       200:
 *         description: Bill adjustment type updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Bill adjustment type not found
 *       409:
 *         description: Another bill adjustment type with this name already exists
 */


/**
 * @swagger
 * /api/bill-adjustment-types/{id}:
 *   delete:
 *     summary: Delete a bill adjustment type (soft delete)
 *     tags: [Bill Adjustment Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Bill adjustment type deleted
 *       400:
 *         description: Cannot delete type as it is in use
 *       404:
 *         description: Bill adjustment type not found
 */
