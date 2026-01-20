const express = require("express");
const router = express.Router();
const svc = require("../services/leaveService");

router.post("/leaves", svc.createLeave);
router.get("/leaves", svc.getAllLeaves);
router.get("/leaves/:id", svc.getLeaveById);
router.put("/leaves/:id", svc.updateLeave);
router.put("/leaves/:id/status", svc.updateLeaveStatus);
router.delete("/leaves/:id", svc.deleteLeave);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Leaves
 *   description: Leave management
 */

/**
 * @swagger
 * /leaves:
 *   post:
 *     summary: Create a new leave request
 *     tags: [Leaves]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - leave_date
 *               - leave_type_id
 *               - reason
 *             properties:
 *               leave_date:
 *                 type: string
 *                 format: date
 *               leave_type_id:
 *                 type: integer
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Leave request created successfully
 *       400:
 *         description: Invalid input
 */


/**
 * @swagger
 * /leaves:
 *   get:
 *     summary: Get all leave requests
 *     tags: [Leaves]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter leaves after this date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter leaves before this date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *         description: Filter by leave status
 *       - in: query
 *         name: leave_type_id
 *         schema:
 *           type: integer
 *         description: Filter by leave type ID
 *       - in: query
 *         name: employee_id
 *         schema:
 *           type: integer
 *         description: Filter by employee ID
 *     responses:
 *       200:
 *         description: List of leave requests
 */


/**
 * @swagger
 * /leaves/{id}:
 *   get:
 *     summary: Get a leave request by ID
 *     tags: [Leaves]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Leave request details
 *       404:
 *         description: Leave request not found
 */


/**
 * @swagger
 * /leaves/{id}:
 *   put:
 *     summary: Update a leave request
 *     tags: [Leaves]
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
 *               leave_date:
 *                 type: string
 *                 format: date
 *               leave_type_id:
 *                 type: integer
 *               reason:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected]
 *     responses:
 *       200:
 *         description: Leave request updated
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Leave request not found
 */


/**
 * @swagger
 * /leaves/{id}:
 *   delete:
 *     summary: Delete a leave request (soft delete)
 *     tags: [Leaves]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Leave request deleted
 *       404:
 *         description: Leave request not found
 */

