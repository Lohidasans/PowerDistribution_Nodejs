const express = require("express");
const router = express.Router();
const svc = require("../services/leaveTypeService");

router.post("/leave-types", svc.createLeaveType);
router.get("/leave-types", svc.getAllLeaveTypes);
router.get("/leave-types/:id", svc.getLeaveTypeById);
router.put("/leave-types/:id", svc.updateLeaveType);
router.delete("/leave-types/:id", svc.deleteLeaveType);

module.exports = router;


/**
 * @swagger
 * tags:
 *   name: Leave Types
 *   description: Leave type management
 */

/**
 * @swagger
 * /leave-types:
 *   post:
 *     summary: Create a new leave type
 *     tags: [Leave Types]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - leave_type_name
 *             properties:
 *               leave_type_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *     responses:
 *       201:
 *         description: Leave type created successfully
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Leave type with this name already exists
 */

/**
 * @swagger
 * /leave-types:
 *   get:
 *     summary: Get all leave types
 *     tags: [Leave Types]
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of leave types
 */

/**
 * @swagger
 * /leave-types/{id}:
 *   get:
 *     summary: Get a leave type by ID
 *     tags: [Leave Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Leave type details
 *       404:
 *         description: Leave type not found
 */


/**
 * @swagger
 * /leave-types/{id}:
 *   put:
 *     summary: Update a leave type
 *     tags: [Leave Types]
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
 *               leave_type_name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *     responses:
 *       200:
 *         description: Leave type updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Leave type not found
 *       409:
 *         description: Another leave type with this name already exists
 */


/**
 * @swagger
 * /leave-types/{id}:
 *   delete:
 *     summary: Delete a leave type (soft delete)
 *     tags: [Leave Types]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Leave type deleted
 *       400:
 *         description: Cannot delete leave type as it is in use
 *       404:
 *         description: Leave type not found
 */

