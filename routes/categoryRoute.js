var express = require("express");
var categoryRouter = express.Router();
const categoryService = require("../services/categoryService");

categoryRouter.post("/category", categoryService.createCategory);
categoryRouter.get("/category", categoryService.getAllCategories);
categoryRouter.get(
  "/category/dropdown",
  categoryService.listCategoriesDropdown
);
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
 * components:
 *   schemas:
 *     Category:
 *       type: object
 *       properties:
 *         material_type_id:
 *           type: integer
 *           description: ID of the related material type
 *         category_name:
 *           type: string
 *           description: Name of the category
 *         category_image_url:
 *           type: string
 *           description: Image URL for the category
 *         short_name:
 *           type: string
 *           description: Short code/abbreviation for the category
 *         description:
 *           type: string
 *           description: Description of the category
 *         sort_order:
 *           type: integer
 *           description: Sorting number for ordering categories
 *         status:
 *           type: string
 *           enum: [Active, Inactive]
 *           description: Active or inactive status
 *       required:
 *         - material_type_id
 *         - category_name
 */

/**
 * @openapi
 * /api/v1/category:
 *   get:
 *     summary: List all categories
 *     tags: [Category]
 *     parameters:
 *       - in: query
 *         name: material_type_id
 *         schema:
 *           type: integer
 *         description: Filter categories by material type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by category name
 *     responses:
 *       200:
 *         description: Successful response
 *
 *   post:
 *     summary: Create a new category
 *     tags: [Category]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Category'
 *     responses:
 *       201:
 *         description: Category created successfully
 */

/**
 * @openapi
 * /api/v1/category/dropdown:
 *   get:
 *     summary: Category list for dropdown
 *     tags: [Category]
 *     responses:
 *       200:
 *         description: Successful response
 */

/**
 * @openapi
 * /api/v1/category/{id}:
 *   get:
 *     summary: Get category details by ID
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category details
 *
 *   put:
 *     summary: Update a category
 *     tags: [Category]
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
 *             $ref: '#/components/schemas/Category'
 *     responses:
 *       200:
 *         description: Category updated
 *
 *   delete:
 *     summary: Delete a category
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Category deleted
 */
