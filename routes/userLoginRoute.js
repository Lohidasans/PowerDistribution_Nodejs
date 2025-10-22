var express = require("express");
var router = express.Router();
const userService = require("../services/userLoginService");

// CRUD
router.post("/user", userService.createUser);
router.get("/user", userService.listUsers);
router.get("/user/:id", userService.getUserById);
router.put("/user/:id", userService.updateUser);
router.delete("/user/:id", userService.deleteUser);

module.exports = router;

/**
 * @openapi
 * tags:
 *   - name: User
 *     description: User management
 */

/**
 * @openapi
 * /api/v1/user:
 *   get:
 *     summary: List users
 *     tags: [User]
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/user/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update user by ID
 *     tags: [User]
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
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete user (soft)
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
