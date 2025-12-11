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
 *         role_name:
 *           type: string
 *         created_at:
 *           type: string
 *         updated_at:
 *           type: string
 *         deleted_at:
 *           type: string
 *
 *     CreateRoleRequest:
 *       type: object
 *       required:
 *         - role_name
 *       properties:
 *         role_name:
 *           type: string
 *
 *     UpdateRoleRequest:
 *       type: object
 *       properties:
 *         role_name:
 *           type: string
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
 *             page:
 *               type: integer
 *             pageSize:
 *               type: integer
 *             totalPages:
 *               type: integer
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
 *         description: Role already exists
 */

/**
 * @swagger
 * /api/v1/roles:
 *   get:
 *     summary: Get all roles with pagination & search
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
 *     summary: Get list of roles for dropdown
 *     description: Returns all employee roles in { id, name } format.
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
 *                             example: Manager
 */
