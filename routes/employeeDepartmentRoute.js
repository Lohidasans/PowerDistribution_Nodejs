const express = require('express');
const router = express.Router();
const svc = require('../services/employeeDepartmentService');

// CRUD operations
router.post('/employee-departments', svc.createEmployeeDepartment);
router.get('/employee-departments', svc.getEmployeeDepartments);
router.get('/employee-departments/:id', svc.getEmployeeDepartmentById);
router.put('/employee-departments/:id', svc.updateEmployeeDepartment);
router.delete('/employee-departments/:id', svc.deleteEmployeeDepartment);

// Swagger documentation
/**
 * @openapi
 * tags:
 *   - name: Employee Departments
 *     description: Employee Department Management
 */

/**
 * @openapi
 * /api/v1/employee-departments:
 *   post:
 *     summary: Create a new employee department
 *     tags: [Employee Departments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - department_name
 *             properties:
 *               department_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Department created successfully
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Department with this name already exists
 */

/**
 * @openapi
 * /api/v1/employee-departments:
 *   get:
 *     summary: Get all employee departments
 *     tags: [Employee Departments]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of departments
 */

/**
 * @openapi
 * /api/v1/employee-departments/{id}:
 *   get:
 *     summary: Get department by ID
 *     tags: [Employee Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Department details
 *       404:
 *         description: Department not found
 */

/**
 * @openapi
 * /api/v1/employee-departments/{id}:
 *   put:
 *     summary: Update a department
 *     tags: [Employee Departments]
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
 *               department_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Department updated successfully
 *       404:
 *         description: Department not found
 *       409:
 *         description: Another department with this name already exists
 */

/**
 * @openapi
 * /api/v1/employee-departments/{id}:
 *   delete:
 *     summary: Delete a department (soft delete)
 *     tags: [Employee Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Department deleted successfully
 *       404:
 *         description: Department not found
 */

module.exports = router;