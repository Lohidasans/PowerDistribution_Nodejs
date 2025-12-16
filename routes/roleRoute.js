var express = require("express");
var roleRouter = express.Router();
const roleService = require("../services/rolesService");

roleRouter.post("/roles", roleService.createRole);
roleRouter.get("/roles", roleService.getRoles);
roleRouter.get("/roles/dropdown", roleService.listRolesDropdown);
roleRouter.get("/roles/:id", roleService.getRoleById);
roleRouter.put("/roles/:id", roleService.updateRole);
roleRouter.delete("/roles/:id", roleService.deleteRole);


module.exports = roleRouter;

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Employee Role Management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Role:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         role_name:
 *           type: string
 *           example: Sales Executive
 *         department_id:
 *           type: integer
 *           example: 1
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     CreateRoleRequest:
 *       type: object
 *       required:
 *         - role_name
 *         - department_id
 *       properties:
 *         role_name:
 *           type: string
 *           example: Sales Executive
 *         department_id:
 *           type: integer
 *           example: 1
 *
 *     UpdateRoleRequest:
 *       type: object
 *       properties:
 *         role_name:
 *           type: string
 *           example: Branch Admin
 *         department_id:
 *           type: integer
 *           example: 2
 *
 *     PaginatedRoles:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Role'
 *         pagination:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *               example: 25
 *             page:
 *               type: integer
 *               example: 1
 *             pageSize:
 *               type: integer
 *               example: 10
 *             totalPages:
 *               type: integer
 *               example: 3
 */

/**
 * @swagger
 * /api/v1/roles:
 *   post:
 *     summary: Create a new employee role
 *     tags: [Roles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoleRequest'
 *     responses:
 *       201:
 *         description: Role created successfully
 *       400:
 *         description: Role already exists in this department
 */

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     summary: Get all roles with pagination, search, and department filter
 *     tags: [Roles]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         required: false
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         required: false
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *       - in: query
 *         name: department_id
 *         schema:
 *           type: integer
 *         required: false
 *         description: Filter roles by department
 *     responses:
 *       200:
 *         description: List of roles
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedRoles'
 */

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   get:
 *     summary: Get a role by ID
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Role fetched successfully
 *       404:
 *         description: Role not found
 */

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   put:
 *     summary: Update a role
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleRequest'
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       404:
 *         description: Role not found
 */

/**
 * @swagger
 * /api/v1/roles/{id}:
 *   delete:
 *     summary: Soft delete a role
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *     responses:
 *       204:
 *         description: Role deleted successfully
 *       404:
 *         description: Role not found
 */

/**
 * @swagger
 * /api/v1/roles/dropdown:
 *   get:
 *     tags:
 *       - Roles
 *     summary: Get roles dropdown by department
 *     description: Returns active roles for a department in `{ id, name }` format.
 *     parameters:
 *       - in: query
 *         name: department_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Department ID to fetch roles for
 *     responses:
 *       200:
 *         description: Successfully retrieved list of roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Success
 *                 data:
 *                   type: object
 *                   properties:
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: Sales Executive
 */
