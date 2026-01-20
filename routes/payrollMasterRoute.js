const express = require('express');
const router = express.Router();
const svc = require('../services/payrollMasterService');

// CRUD operations
router.post('/payroll-masters', svc.createPayrollMaster);
router.get('/payroll-masters', svc.getPayrollMasters);
router.get('/payroll-masters/:id', svc.getPayrollMasterById);
router.put('/payroll-masters/:id', svc.updatePayrollMaster);
router.delete('/payroll-masters/:id', svc.deletePayrollMaster);

// Swagger documentation
/**
 * @openapi
 * tags:
 *   - name: Payroll Masters
 *     description: Payroll Master Management
 */

/**
 * @openapi
 * /api/v1/payroll-masters:
 *   post:
 *     summary: Create a new payroll master
 *     tags: [Payroll Masters]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payroll_master_type_id
 *               - pay_type_name
 *               - calculation_type_id
 *               - payroll_value
 *               - branch_id
 *             properties:
 *               payroll_master_type_id:
 *                 type: integer
 *                 description: ID of the payroll master type
 *               pay_type_name:
 *                 type: string
 *                 description: Name of the pay type
 *               calculation_type_id:
 *                 type: integer
 *                 description: ID of the calculation type
 *               payroll_value:
 *                 type: number
 *                 format: decimal
 *                 description: Value for the payroll
 *               branch_id:
 *                 type: integer
 *                 description: ID of the branch
 *     responses:
 *       201:
 *         description: Payroll master created successfully
 *       400:
 *         description: Invalid input or payroll master already exists
 */

/**
 * @openapi
 * /api/v1/payroll-masters:
 *   get:
 *     summary: Get all payroll masters
 *     tags: [Payroll Masters]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by pay type name
 *     responses:
 *       200:
 *         description: List of payroll masters
 */

/**
 * @openapi
 * /api/v1/payroll-masters/{id}:
 *   get:
 *     summary: Get payroll master by ID
 *     tags: [Payroll Masters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Payroll master ID
 *     responses:
 *       200:
 *         description: Payroll master details
 *       404:
 *         description: Payroll master not found
 */

/**
 * @openapi
 * /api/v1/payroll-masters/{id}:
 *   put:
 *     summary: Update a payroll master
 *     tags: [Payroll Masters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Payroll master ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payroll_master_type_id:
 *                 type: integer
 *               pay_type_name:
 *                 type: string
 *               calculation_type_id:
 *                 type: integer
 *               payroll_value:
 *                 type: number
 *                 format: decimal
 *               branch_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Payroll master updated successfully
 *       404:
 *         description: Payroll master not found
 *       409:
 *         description: Another payroll master with this name already exists
 */

/**
 * @openapi
 * /api/v1/payroll-masters/{id}:
 *   delete:
 *     summary: Delete a payroll master (soft delete)
 *     tags: [Payroll Masters]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Payroll master ID
 *     responses:
 *       200:
 *         description: Payroll master deleted successfully
 *       404:
 *         description: Payroll master not found
 */

module.exports = router;
