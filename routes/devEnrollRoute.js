var express = require("express");
var devEnrollRouter = express.Router();
const devEnrollService = require("../services/devEnrollService");

// Enroll user to device
devEnrollRouter.post("/enroll-user", devEnrollService.enrollUsers);

// Assign device to user
devEnrollRouter.post("/assign-device", devEnrollService.assignDevice);

module.exports = devEnrollRouter;

/**
 * @openapi
 * tags:
 *   - name: Device Enrollment
 *     description: Device enrollment and assignment management
 */

/**
 * @openapi
 * /api/v1/enroll-user:
 *   post:
 *     summary: Enroll user to a device
 *     tags: [Device Enrollment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - enroll_type
 *               - device_id
 *               - type
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: Employee ID or user ID
 *               enroll_type:
 *                 type: string
 *                 enum: [Face Recognition, Card]
 *                 description: Type of enrollment
 *               device_id:
 *                 type: string
 *                 description: Device ID to enroll user to
 *               type:
 *                 type: string
 *                 enum: [Employee]
 *                 description: User type
 *               created_id:
 *                 type: string
 *                 description: ID of user who created the enrollment (optional)
 *     responses:
 *       200:
 *         description: User enrolled successfully
 *       404:
 *         description: Device or user not found
 *       400:
 *         description: Invalid user type
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/v1/assign-device:
 *   post:
 *     summary: Assign device to user
 *     tags: [Device Enrollment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee_id
 *               - type
 *               - device_id
 *               - ref_employee_id
 *               - name
 *               - enroll_type
 *             properties:
 *               employee_id:
 *                 type: string
 *                 description: Employee ID
 *               type:
 *                 type: string
 *                 enum: [Employee]
 *                 description: User type
 *               device_id:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of device IDs
 *                 example: ["RJT_DEV_001", "RJT_DEV_002"]
 *               ref_employee_id:
 *                 type: string
 *                 description: Reference employee ID
 *               name:
 *                 type: string
 *                 description: Employee name
 *               enroll_type:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Face Recognition, Card]
 *                 description: Array of enrollment types
 *                 example: ["Face Recognition", "Card"]
 *     responses:
 *       200:
 *         description: Device assignment successful
 *       500:
 *         description: Error during device assignment
 */
