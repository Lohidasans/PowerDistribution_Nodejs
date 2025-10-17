var express = require("express");
var branchRouter = express.Router();
const branchService = require("../services/branchService");

branchRouter.post("/branch", branchService.createBranch);
branchRouter.get("/branch", branchService.listBranches);
branchRouter.get("/branch/dropdown", branchService.branchDropdownList);
branchRouter.get("/branch/:id", branchService.getBranchById);
branchRouter.put("/branch/:id", branchService.updateBranch);
branchRouter.delete("/branch/:id", branchService.deleteBranch);

module.exports = branchRouter;
/**
 * @openapi
 * tags:
 *   - name: Branch
 *     description: Branch management
 */
/**
 * @openapi
 * /api/v1/branch:
 *   get:
 *     summary: List branches
 *     tags: [Branch]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Active, Inactive] }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create branch
 *     tags: [Branch]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Branch'
 *     responses:
 *       201:
 *         description: Created
 */
/**
 * @openapi
 * /api/v1/branch/{id}:
 *   get:
 *     summary: Get branch by ID
 *     tags: [Branch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update branch
 *     tags: [Branch]
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
 *             $ref: '#/components/schemas/Branch'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete branch (soft)
 *     tags: [Branch]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
 */
