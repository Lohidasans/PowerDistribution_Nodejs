/**
  * @openapi
  * tags:
  *   - name: Role
  *     description: Role management
  */
 /**
  * @openapi
  * /api/v1/role:
  *   get:
  *     summary: List roles
  *     tags: [Role]
  *     parameters:
  *       - in: query
  *         name: search
  *         schema: { type: string }
  *     responses:
  *       200:
  *         description: OK
  *   post:
  *     summary: Create role
  *     tags: [Role]
  *     requestBody:
  *       required: true
  *       content:
  *         application/json:
  *           schema:
  *             type: object
  *             properties:
  *               role_name: { type: string }
  *             required: [role_name]
  *     responses:
  *       201:
  *         description: Created
  */
 /**
  * @openapi
  * /api/v1/role/{id}:
  *   get:
  *     summary: Get role by ID
  *     tags: [Role]
  *     parameters:
  *       - in: path
  *         name: id
  *         required: true
  *         schema: { type: integer }
  *     responses:
  *       200:
  *         description: OK
  *   put:
  *     summary: Update role
  *     tags: [Role]
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
  *               role_name: { type: string }
  *     responses:
  *       200:
  *         description: OK
  *   delete:
  *     summary: Delete role (soft)
  *     tags: [Role]
  *     parameters:
  *       - in: path
  *         name: id
  *         required: true
  *         schema: { type: integer }
  *     responses:
  *       204:
  *         description: No Content
  */
 var express = require("express");
  var roleRouter = express.Router();
  const roleService = require("../services/rolesService");

  roleRouter.post("/role", roleService.create);
  roleRouter.get("/role", roleService.list);
  roleRouter.get("/role/:id", roleService.getById);
  roleRouter.put("/role/:id", roleService.update);
  roleRouter.delete("/role/:id", roleService.remove);

  module.exports = roleRouter;