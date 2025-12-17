var express = require("express");
var router = express.Router();
const employeeSvc = require("../services/employeeService");
const empContactSvc = require("../services/employeeContactService");
const empExpSvc = require("../services/employeeExperienceService");

// Employee Experiences 
router.post("/employees/experiences/bulk", empExpSvc.createEmployeeExperiences);
router.get("/employees/experiences", empExpSvc.getAllEmployeeExperiences);
router.get("/employees/experiences/dropdown",empExpSvc.listEmployeeExperienceDropdown);
router.get("/employees/experience/:id", empExpSvc.getEmployeeExperienceById);
router.put("/employees/experience/:id", empExpSvc.updateEmployeeExperience);
router.delete("/employees/experience/:id", empExpSvc.deleteEmployeeExperience);

// Employees CRUD
router.post("/employees", employeeSvc.createEmployee);
router.post("/employees/code", employeeSvc.generateEmployeeCode);
router.get("/employees", employeeSvc.listEmployees);
router.get("/employees/dropdown", employeeSvc.listEmployeeDropdown);
router.get("/employees/billing-dropdown", employeeSvc.searchEmployeeDropdown);
router.get("/employees/designations/dropdown", employeeSvc.listDesignationDropdown);
router.get("/employees/departments/dropdown", employeeSvc.listDepartmentDropdown);
router.get("/employees/:id", employeeSvc.getEmployeeById);
router.put("/employees/:id", employeeSvc.updateEmployee);
router.delete("/employees/:id", employeeSvc.deleteEmployee);


// Employee Contacts
router.post("/employees/contacts", empContactSvc.createEmployeeContact);

module.exports = router;

/**
 * @openapi
 * /api/v1/employees/dropdown/search:
 *   get:
 *     summary: Search employees for dropdown by name or employee_no
 *     tags: [Employee]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive search on employee_name or employee_no
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
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
 *                     employees:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           employee_no: { type: string }
 *                           employee_name: { type: string }
 *                           label: { type: string }
 */
/**
 * @openapi
 * /api/v1/employees/designations/dropdown:
 *   get:
 *     summary: List employee designations for dropdown
 *     tags: [Employee]
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
 *                     designations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           name: { type: string }
 */
/**
 * @openapi
 * /api/v1/employees/departments/dropdown:
 *   get:
 *     summary: List employee departments for dropdown
 *     tags: [Employee]
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
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           name: { type: string }
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
 *         name: role_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create a new employee with optional contact, bank account, KYC docs, experiences, and login (create-only for related entities)
 *     tags: [Employee]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeFullCreateInput'
 *     responses:
 *       201:
 *         description: Employee created successfully
 */

/**
 * @openapi
 * /api/v1/employees/{id}:
 *   get:
 *     summary: Get an employee by ID
 *     tags: [Employee]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Employee retrieved successfully
 *   put:
 *     summary: Update an employee with optional updates for contact, bank account, KYC docs, experiences, and login (update-only; KYC/experiences require id)
 *     tags: [Employee]
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
 *             $ref: '#/components/schemas/EmployeeFullUpdateInput'
 *     responses:
 *       200:
 *         description: Employee updated successfully
 *   delete:
 *     summary: Delete an employee
 *     tags: [Employee]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Employee deleted successfully
 */

/**
 * @openapi
 * /api/v1/employees/dropdown:
 *   get:
 *     summary: Get employee dropdown list
 *     tags: [Employee]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @openapi
 * /api/v1/employees/contacts:
 *   post:
 *     summary: Create a contact for an employee
 *     tags: [EmployeeContact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeContactCreateInput'
 *     responses:
 *       201:
 *         description: Employee contact created successfully
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
 *         description: Employee experiences created successfully
 */

/**
 * @openapi
 * /api/v1/employees/experiences/{employee_id}:
 *   get:
 *     summary: Get all experiences of an employee
 *     tags: [EmployeeExperience]
 *     parameters:
 *       - in: path
 *         name: employee_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Employee experiences retrieved successfully
 */

/**
 * @openapi
 * /api/v1/employees/experience/{id}:
 *   get:
 *     summary: Get a single employee experience by ID
 *     tags: [EmployeeExperience]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Employee experience retrieved successfully
 *   put:
 *     summary: Update an employee experience
 *     tags: [EmployeeExperience]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Employee experience updated successfully
 *   delete:
 *     summary: Delete an employee experience
 *     tags: [EmployeeExperience]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Employee experience deleted successfully
 */

/**
 * @openapi
 * /api/v1/employees/experiences/dropdown/list:
 *   get:
 *     summary: Get employee experiences dropdown list
 *     tags: [EmployeeExperience]
 *     responses:
 *       200:
 *         description: OK
 */
