var express = require("express");
var categoryRouter = express.Router();
const categoryService = require("../services/CategoryService");

categoryRouter.post("/category", categoryService.createCategory);
categoryRouter.get("/category", categoryService.listCategories);
categoryRouter.get("/category/:id", categoryService.getCategoryById);
categoryRouter.put("/category/:id", categoryService.updateCategory);
categoryRouter.delete("/category/:id", categoryService.deleteCategory);

module.exports = categoryRouter;

/**
 * @openapi
 * tags:
 *   - name: Category
 *     description: Category management
 */

/**
 * @openapi
 * /api/v1/category:
 *   get:
 *     summary: List categories
 *     tags: [Category]
 *     parameters:
 *       - in: query
 *         name: material_type_id
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Create category
 *     tags: [Category]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Category'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/v1/category/{id}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *   put:
 *     summary: Update category
 *     tags: [Category]
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
 *             $ref: '#/components/schemas/Category'
 *     responses:
 *       200:
 *         description: OK
 *   delete:
 *     summary: Delete category (soft)
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: No Content
*/