var express = require("express");
var router = express.Router();
const employeeSvc = require("../services/employeeService");
const empContactSvc = require("../services/employeeContactService");
const empExpSvc = require("../services/employeeExperienceService");

// Employees
router.post("/employees", employeeSvc.createEmployee);
router.get("/employees", employeeSvc.listEmployees);

// Contacts
router.post("/employees/contacts", empContactSvc.createEmployeeContact);

// Experiences (bulk)
router.post("/employees/experiences/bulk", empExpSvc.bulkCreateExperiences);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: Employee
 *     description: Employee basic details
 *   - name: EmployeeContact
 *     description: Employee contact details
 *   - name: EmployeeExperience
 *     description: Employee experiences
 */

/**
 * @openapi
 * /api/v1/employees:
 *   get:
 *     summary: List employees
 *     tags: [Employee]
 *     parameters:
 *       - in: query
 *         name: branch_id
 *         schema: { type: integer }
 *       - in: query
 *         name: department_id
 *         schema: { type: integer }
 *       - in: query
 *         name: designation_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create employee
 *     tags: [Employee]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeCreateInput'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/employees/contacts:
 *   post:
 *     summary: Create employee contact
 *     tags: [EmployeeContact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeContactCreateInput'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/employees/experiences/bulk:
 *   post:
 *     summary: Bulk create employee experiences
 *     tags: [EmployeeExperience]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeExperienceBulkCreateInput'
 *     responses:
 *       201:
 *         description: Created
 */
