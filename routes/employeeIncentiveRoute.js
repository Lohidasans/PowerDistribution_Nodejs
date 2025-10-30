var express = require("express");
var router = express.Router();
const service = require("../services/employeeIncentiveService");

// CRUD
router.post("/employee-incentives", service.createIncentive);
router.get("/employee-incentives", service.listIncentives);
router.get("/employee-incentives/:id", service.getIncentiveById);
router.put("/employee-incentives/:id", service.updateIncentive);
router.delete("/employee-incentives/:id", service.deleteIncentive);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: EmployeeIncentive
 *     description: Employee incentives
 */

/**
 * @openapi
 * /api/v1/employee-incentives:
 *   get:
 *     summary: List employee incentives
 *     tags: [EmployeeIncentive]
 *     parameters:
 *       - in: query
 *         name: department_id
 *         schema: { type: integer }
 *       - in: query
 *         name: role_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create employee incentive
 *     tags: [EmployeeIncentive]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role_id, department_id, sales_target, incentive_type, incentive_value]
 *             properties:
 *               role_id: { type: integer }
 *               department_id: { type: integer }
 *               sales_target: { type: array, items: { type: number } }
 *               incentive_type: { type: string, enum: ["Percentage", "Rupees"] }
 *               incentive_value: { type: number, format: float }
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/employee-incentives/{id}:
 *   get:
 *     summary: Get employee incentive by ID
 *     tags: [EmployeeIncentive]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update employee incentive
 *     tags: [EmployeeIncentive]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role_id: { type: integer }
 *               department_id: { type: integer }
 *               sales_target: { type: array, items: { type: number } }
 *               incentive_type: { type: string, enum: ["Percentage", "Rupees"] }
 *               incentive_value: { type: number, format: float }
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete employee incentive (soft)
 *     tags: [EmployeeIncentive]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
